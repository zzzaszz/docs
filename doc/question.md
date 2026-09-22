# 问题
## 老版本 SQL Server 连接问题

`testConnection` 测试连接时加入 `SELECT 1`，而不是调用封装好的方法，否则会报错。

```java
@Override
public String testConnection(String key) {
    // 获取数据库连接和数据库名字（删缓存连接，再重连）
    Map<String, Object> dataSourceAndName = getDataSource(key, true, null, null, null, null);

    javax.sql.DataSource dataSource = (javax.sql.DataSource) dataSourceAndName.get("dataSource");
    String databaseName = (String) dataSourceAndName.get("databaseName");
    String databaseType = (String) dataSourceAndName.get("databaseType");

    NamedParameterJdbcTemplate jdbcTemplate = new NamedParameterJdbcTemplate(dataSource);

    // 默认测试SQL
    String sql = "SELECT 1";

    // 不同数据库兼容
    if ("oracle".equalsIgnoreCase(databaseType)) {
        sql = "SELECT 1 FROM DUAL";
    }

    try {
        Integer result = jdbcTemplate.queryForObject(
                sql,
                new MapSqlParameterSource(),
                Integer.class
        );

        if (result != null) {
            return "测试连接成功：" + databaseName;
        } else {
            return "测试连接失败：返回结果为空";
        }
    } catch (Exception e) {
        // 获取最底层异常信息
        Throwable root = e;
        while (root.getCause() != null) {
            root = root.getCause();
        }
        return "测试连接失败：" + root.getMessage();
    }
}
```

### HikariPoolProperties 配置中加入 SELECT 1

在 HikariCP 连接池中设置 `connectionTestQuery` 为 `SELECT 1`，解决 jTDS 驱动的 `AbstractMethodError` 问题。

```java
@Component
@ConfigurationProperties(prefix = "spring.datasource.hikari")
@Data
public class HikariPoolProperties extends HikariConfig {

    public HikariPool dataSource(String url, String username, String password, String driverClassName) {
        HikariConfig hikariConfig = new HikariConfig();
        hikariConfig.setJdbcUrl(url);
        hikariConfig.setUsername(username);
        hikariConfig.setPassword(password);
        hikariConfig.setDriverClassName(driverClassName);

        // 解决 jtds 驱动 AbstractMethodError
        hikariConfig.setConnectionTestQuery("SELECT 1");

        hikariConfig.setConnectionTimeout(getConnectionTimeout());
        hikariConfig.setValidationTimeout(getValidationTimeout());
        hikariConfig.setIdleTimeout(getIdleTimeout());
        hikariConfig.setMaxLifetime(getMaxLifetime());
        hikariConfig.setMaximumPoolSize(getMaximumPoolSize());

        int minIdle = getMinimumIdle();
        if (minIdle < 0) {
            minIdle = getMaximumPoolSize();
        }
        hikariConfig.setMinimumIdle(minIdle);

        return new HikariPool(hikariConfig);
    }
}
```

---

## 后端大量数据处理方案（MyBatis BATCH 模式）

### 说明

`ExecutorType.BATCH` 是 MyBatis 提供的批处理模式，用于批量执行 INSERT、UPDATE、DELETE 操作。它会缓存 SQL 并在适当时机统一提交，从而减少数据库交互次数。

```java
sqlSessionFactory.openSession(ExecutorType.BATCH, false);
```

**参数说明：**
- `ExecutorType.BATCH`：启用批处理模式
- `false`：关闭自动提交，由程序手动控制事务

### 完整示例

```java
@Transactional(rollbackFor = Exception.class)
public String syncAreaQtyBatch(String misizetoareaqty, String tenantid) {

    // 1. 参数校验
    if (StringUtils.isBlank(misizetoareaqty)) {
        throw new IllegalArgumentException("VM计算公式不能为空！");
    }
    if (StringUtils.isBlank(tenantid)) {
        throw new IllegalArgumentException("租户ID不能为空！");
    }

    // 2. 查询数据
    List<MatSpecpcbPojo> list =
            this.matSpecpcbMapper.getListByTenantId(tenantid);

    if (list == null || list.isEmpty()) {
        throw new IllegalArgumentException("未找到可修改的规格数据！");
    }

    final int BATCH_SIZE = 500;
    int successCount = 0;
    int failCount = 0;

    List<String> specNames = new ArrayList<>();

    SqlSession sqlSession = null;

    try {
        // 3. 开启 MyBatis BATCH 模式
        sqlSession = sqlSessionFactory.openSession(ExecutorType.BATCH, false);
        MatGoodsMapper batchMapper = sqlSession.getMapper(MatGoodsMapper.class);
        int batchCount = 0;

        for (MatSpecpcbPojo pojo : list) {
            try {
                // 渲染并计算 VM
                String renderedResult = SpecVelocityUtils.renderAndCalculate(
                        misizetoareaqty,
                        JSON.toJSONString(pojo)
                );
                if (StringUtils.isBlank(renderedResult)) {
                    continue;
                }
                JSONObject jsonObject = JSON.parseObject(renderedResult);

                if (jsonObject.containsKey("areaqty")) {
                    pojo.setAreaqty(jsonObject.getDouble("areaqty"));
                }
                if (jsonObject.containsKey("areaunit")) {
                    pojo.setAreaunit(jsonObject.getString("areaunit"));
                }

                // 批量更新
                batchMapper.updateGoodsSpecidAndPcsX(pojo);
                successCount++;
                batchCount++;

                // 达到批量大小时刷新
                if (batchCount % BATCH_SIZE == 0) {
                    sqlSession.flushStatements();
                    sqlSession.clearCache();
                }
            } catch (Exception e) {
                failCount++;
                specNames.add(pojo.getItemcode());
                logger.error("规格ID：{} 计算失败：{}",
                        pojo.getId(), e.getMessage(), e);
            }
        }

        // 刷新剩余 SQL
        List<BatchResult> results = sqlSession.flushStatements();
        sqlSession.commit();
        logger.info("批处理执行完成，共生成 {} 个批次。", results.size());
    } catch (Exception e) {
        if (sqlSession != null) {
            sqlSession.rollback();
        }
        throw new RuntimeException("批量同步失败", e);
    } finally {
        if (sqlSession != null) {
            sqlSession.close();
        }
    }

    // 4. 组装返回结果
    StringBuilder result = new StringBuilder();
    result.append("同步完成：成功 ")
            .append(successCount)
            .append(" 条，失败 ")
            .append(failCount)
            .append(" 条");

    if (!specNames.isEmpty()) {
        result.append("；失败规格编码：")
                .append(String.join("、", specNames));
    }

    logger.info(result.toString());
    return result.toString();
}
```

### Mapper XML

```xml
<update id="updateGoodsSpecidAndPcsX">
    update Mat_Goods
    set Specid   = #{id},
        PcsX     = #{pcsx},
        PcsY     = #{pcsy},
        SizeUnit = #{sizeunit},
        SetX     = #{setx},
        SetY     = #{sety},
        Set2Pcs  = #{set2pcs},
        PnlX     = #{pnlx},
        PnlY     = #{pnly},
        Pnl2Pcs  = #{pnl2pcs},
        AreaQty  = #{areaqty},
        AreaUnit = #{areaunit}
    where id = #{goodsid}
      and Tenantid = #{tenantid}
</update>
```

---

## 后端中等数据更新处理方案（CASE WHEN 批量更新）

适合几百到几千条数据的批量更新场景，一条 SQL 搞定，比逐条更新效率高很多。

```xml
<update id="batchUpdateGoodsInfo">
    <!-- 批量更新货品信息 -->
    UPDATE MatCamproject
    <set>
        GoodsUid = CASE id
        <foreach collection="list" item="item">
            WHEN #{item.id} THEN #{item.goodsuid}
        </foreach>
        END,

        GoodsName = CASE id
        <foreach collection="list" item="item">
            WHEN #{item.id} THEN #{item.goodsname}
        </foreach>
        END,

        GoodsSpec = CASE id
        <foreach collection="list" item="item">
            WHEN #{item.id} THEN #{item.goodsspec}
        </foreach>
        END,

        ModifyDate = CASE id
        <foreach collection="list" item="item">
            WHEN #{item.id} THEN #{item.modifydate}
        </foreach>
        END,

        Revision = CASE id
        <foreach collection="list" item="item">
            WHEN #{item.id} THEN #{item.revision}
        </foreach>
        END
    </set>
    WHERE Tid = #{tid}
    AND id IN
    <foreach collection="list" item="item" open="(" separator="," close=")">
        #{item.id}
    </foreach>
</update>
```

---
## Redis 按半小时构建每天的预警列表

```java
@Override
public void rebuildTodaySchedule() {

    LocalDate today = LocalDate.now();

    // key=08:30, value=[用户1, 用户2]
    Map<String, List<WarnPushItem>> slotMap = new HashMap<>();

    List<CiwarninguserPojo> userList = ciwarninguserMapper.getAllWarningUser();

    for (CiwarninguserPojo user : userList) {

        List<String> slots = warnTimingMatcher.getSlots(user, today);

        if (slots == null || slots.isEmpty()) {
            continue;
        }

        WarnPushItem item = new WarnPushItem();
        item.setWarnid(user.getWarnid());
        item.setUserid(user.getUserid());
        item.setTenantid(user.getTenantid());
        if (user.getNotifyenabled() == 1) {
            item.setNotifyEmail(user.getNotifyemail());
        }

        for (String slot : slots) {
            slotMap.computeIfAbsent(slot, k -> new ArrayList<>()).add(item);
        }
    }

    saveToRedis(slotMap, today);
}

/**
 * 把已经计算好的"时间槽 → 用户列表"写入 Redis。
 */
private void saveToRedis(Map<String, List<WarnPushItem>> slotMap, LocalDate today) {

    String date = today.format(DateTimeFormatter.BASIC_ISO_DATE);

    for (Map.Entry<String, List<WarnPushItem>> entry : slotMap.entrySet()) {
        // 去除冒号，因为 Redis key 不允许有冒号
        String slot = entry.getKey().replace(":", "");

        String redisKey = "warn:push:" + date + ":" + slot;

        redisTemplate.opsForValue().set(redisKey, entry.getValue(), 1, TimeUnit.DAYS);
    }
}
```
---
## 为所有接口判断是否登录到期，AOP校验
```java
@Aspect  
@Component  
public class AuthAspect {  
  
    private static final Logger log = LoggerFactory.getLogger(AuthAspect.class);  
  
    private static final String ACCESS_TOKEN_KEY_PREFIX = "login:access:";  
  
    /** 无需 Token 校验的接口路径 */  
    private static final Set<String> SKIP_PATHS = new HashSet<>(Arrays.asList(  
            "/api/auth/login",  
            "/api/auth/register",  
            "/api/auth/refresh",  
            "/api/auth/logout"  
    ));  
  
    /** Swagger/Knife4j 等无需拦截 */  
    private static final Set<String> SKIP_PREFIXES = new HashSet<>(Arrays.asList(  
            "/swagger", "/webjars", "/v2/api-docs", "/v3/api-docs", "/doc.html", "/favicon", "/error"  
    ));  
  
    @Resource  
    private RedisService redisService;  
  
    /** 切点：所有 controller 包下的 public 方法 */  
    @Pointcut("execution(public * zzz.service.forum.controller..*.*(..))")  
    public void controllerLayer() {  
    }  
    @Around("controllerLayer()")  
    public Object around(ProceedingJoinPoint joinPoint) throws Throwable {  
        ServletRequestAttributes attrs = (ServletRequestAttributes) RequestContextHolder.getRequestAttributes();  
        if (attrs == null) {  
            return joinPoint.proceed();  
        }  
  
        HttpServletRequest request = attrs.getRequest();  
        String path = request.getRequestURI();  
  
        // 跳过不需要校验的路径  
        if (SKIP_PATHS.contains(path)) {  
            return joinPoint.proceed();  
        }  
        for (String prefix : SKIP_PREFIXES) {  
            if (path.startsWith(prefix)) {  
                return joinPoint.proceed();  
            }  
        }  
  
        // 校验 Token        String authHeader = request.getHeader("Authorization");  
        if (authHeader == null || authHeader.isEmpty()) {  
            log.debug("缺少 Authorization 头，path={}", path);  
            return R.fail(401, "登录到期");  
        }  
  
        String token = authHeader;  
        if (token.startsWith("Bearer ")) {  
            token = token.substring(7);  
        }  
  
        try {  
            // 必须是 access token            if (!JwtUtils.isAccessToken(token)) {  
                log.debug("非 access token，path={}", path);  
                return R.fail(401, "登录到期");  
            }  
  
            Long userId = JwtUtils.parseToken(token).get("userId", Long.class);  
  
            // Redis 中校验 token 是否存在且一致  
            String redisKey = ACCESS_TOKEN_KEY_PREFIX + userId;  
            String storedToken = redisService.getCacheObject(redisKey);  
            if (storedToken == null || !storedToken.equals(token)) {  
                log.debug("Token 已过期或不存在，userId={}, path={}", userId, path);  
                return R.fail(401, "登录到期");  
            }  
  
            // 设置用户上下文  
            UserContext.setUserId(userId);  
        } catch (Exception e) {  
            log.debug("Token 校验异常，path={}, msg={}", path, e.getMessage());  
            return R.fail(401, "登录到期");  
        }  
  
        // Token 有效，继续执行  
        try {  
            return joinPoint.proceed();  
        } finally {  
            UserContext.clear();  
        }  
    }  
}
```
---
## 根据排程倒排计划日期
```java
if (Objects.equals(wipgroupPojo.getDaytype(), 1)) {  
    // 后续工序累计天数  
    int totalAfterDays = 0;  
    // 从最后一道工序开始倒排  
    for (int i = itemList.size() - 1; i >= 0; i--) {  
        WkWipnoteitemPojo item = itemList.get(i);  
        Integer wkday = 0;  
        if (StringUtils.isNotBlank(item.getWpid()) && wpidToWkdayMap.containsKey(item.getWpid())) {  
            wkday = wpidToWkdayMap.get(item.getWpid());  
            if (wkday == null) {  
                wkday = 0;  
            }  
        }  
        // 当前工序计划日期 = 主计划日期 - 当前工序及后续工序总耗时  
        Calendar calendar = Calendar.getInstance();  
        calendar.setTime(mainPlanDate);  
        calendar.add(Calendar.DAY_OF_MONTH, -(totalAfterDays + wkday));  
        item.setPlandate(calendar.getTime());  
        // 累加当前工序耗时，给前一道工序使用  
        totalAfterDays += wkday;  
    }  
}
```
## 采购数量累计计算的问题
```java
// 按材料预算明细累计本次采购前面行占用的数量（扣减旧数量后的净增）  
Map<String, Double> citeQtyMap = new HashMap<>();  
for (BuyPlanitemPojo planItem : lst) {  
    if ("材料预算".equals(billType)) {  
        CmsMatbudgetitemPojo cmsMatbudgetitemPojo = this.cmsMatbudgetitemMapper.getEntity(planItem.getCiteitemid());  
        if (cmsMatbudgetitemPojo != null) {  
            //旧单据  
            BuyPlanitemPojo entity = buyPlanitemMapper.getEntity(planItem.getId(), buyPlanPojo.getTenantid());  
            double orgQty = 0D;  
            if (entity != null && entity.getQuantity() != null) {  
                orgQty = entity.getQuantity();  
            }  
            double accumulateQty = citeQtyMap.getOrDefault(planItem.getCiteitemid(), 0D);  
            //历史已采购数量(扣掉本行旧数量) + 本次采购前面行累计数量 + 当前行数量，和材料预算控制数量比较  
            double totalQty = cmsMatbudgetitemPojo.getBuyqty() - orgQty + accumulateQty + planItem.getQuantity();  
            if (totalQty > cmsMatbudgetitemPojo.getCtrlquantity()) {  
                throw new RuntimeException(rowNumber + "行,采购总数:" + totalQty + "超出材料预算数:" + cmsMatbudgetitemPojo.getCtrlquantity());  
            }  
            citeQtyMap.put(planItem.getCiteitemid(), accumulateQty + (planItem.getQuantity() - orgQty));  
        } 
    }  
}



```

## 异步轮询
```java
/**  
 * 倒冲领料  
 *  
 * @param quickBackDto 倒冲领料参数  
 * @return 处理结果  
 */  
@ApiOperation(value = "轮询倒冲领料", notes = "倒冲领料", produces = "application/json")  
@RequestMapping(value = "/quickBackflush", method = RequestMethod.POST)  
@PreAuthorize(hasPermi = "Mat_Requisition.Edit")  
public R<String> quickBackflush(@RequestBody QuickBackDto quickBackDto) {  
    LoginUser loginUser = tokenService.getLoginUser(ServletUtils.getRequest());  
    try {  
        String redisKey = UUID.randomUUID().toString();  
        this.matRequisitionService.createAsync(quickBackDto,redisKey,loginUser.getTenantid(),SecurityUtils.getToken(ServletUtils.getRequest()));  
        return R.ok(redisKey);  
    } catch (Exception e) {  
        return R.fail(e.getMessage());  
    }  
}  

/* 下层service加入
@Override  
@Async  
@Transactional  
*/

  
@ApiOperation(value = "轮询创建任务状态", notes = "按uuid查询异步创建状态:code=100进行中/200成功(含billid,refno)/500失败(含error)", produces = "application/json")  
@RequestMapping(value = "/getCreateState", method = RequestMethod.GET)  
public R<Map<String, Object>> getCreateState(String rediskey) {  
    // getCacheObject 是泛型方法 <T> T，须以 Map 接收让 T 推断为 Map，再 R.ok 包装；  
    // 状态存独立 key（costsettle_state:{uuid}）带 TTL，避免 hash field 无法单独过期导致堆积  
    Map<String, Object> state = redisService.getCacheObject(MyConstant.ASYNC_REQUISITION_STATE + rediskey);  
    return R.ok(state);  
}

```

---

## 注册后异步发欢迎邮件（MQ 异步解耦）

注册成功后要发欢迎邮件。发邮件要连 SMTP，几百毫秒到几秒，**同步发就等于让用户干等**：
写库 200ms + 发邮件 3000ms ≈ 3.2 秒才返回。改成注册只往队列里发一条消息，邮件由消费者在另一个线程发，
接口 200ms 就返回了。

```java
// 注册业务：只喊一声“这个用户注册成功了”，一行邮件代码都没有 → 解耦
sender.send("", MqConst.EXAMPLE_MAIL_QUEUE, email);

// 邮件消费者：跑在独立线程上，接口早就返回了它才开始干活
@RabbitListener(queues = MqConst.EXAMPLE_MAIL_QUEUE)
public void onMailTask(String email) {
    mailService.sendWelcomeMail(email);
}
```

同一份注册逻辑再加一件后续动作（把手机号、客户等级同步到另一张库表），对比更明显：

- 同步做：写库 200ms + 发邮件 3000ms + 跨库同步 500ms ≈ **3700ms**，用户全程干等
- 异步做：只是多发一条消息，接口仍然 ≈ **200ms**

**要点：**
- 异步：把"必须现在做完的"（写库）和"可以稍后做的"（发邮件、跨库同步）拆开；
- 解耦：注册逻辑里没有一行邮件/资料代码，将来要加发短信、送积分，都是各自加消费者，注册代码不用动；
- 代价：后续动作失败**不影响**注册成功，所以必须配合重试 + 死信队列兜底。

### 发消息失败：退避重试 4 次，仍失败就不再执行后续步骤

发消息本身也会失败（Broker 连不上、连接被拒、channel 已关闭），`convertAndSend` 会抛 `AmqpException`。

```java
boolean mailSent = false;
int failedTimes = 0;
for (int attempt = 1; attempt <= MAX_SEND_RETRY; attempt++) {   // MAX_SEND_RETRY = 4
    try {
        sendOrFail("", MqConst.EXAMPLE_MAIL_QUEUE, email, attempt <= failTimes);
        mailSent = true;
        break;
    } catch (Exception e) {
        failedTimes = attempt;
        log.warn("[注册-异步] 第 {}/{} 次发送邮件消息失败：{}", attempt, MAX_SEND_RETRY, e.getMessage());
        if (attempt < MAX_SEND_RETRY) {
            sleep(RETRY_BACKOFF_MS);   // 200ms 退避，重试不是免费的，用户也在等
        }
    }
}

// 4 次全失败：第二步不执行，避免"资料同步了、欢迎邮件却没发"的不一致
if (!mailSent) {
    return "注册已完成，但后续动作未发出：邮件消息连续 " + MAX_SEND_RETRY + " 次发送失败，已放弃资料同步";
}
```

多件事**要么都发、要么都不发**。真实项目更稳的做法是本地消息表：把要发的消息先写进
"待发送消息表"（和注册写在**同一个事务**里），再由定时任务扫表重发——接口不用死等重试，进程挂了也不丢消息。

### 消费失败：放回队列重试，累计 3 次后进死信

消费端处理失败（目标库唯一键冲突、字段超长、库连不上）**不要抛异常**，抛出去会 nack 重回队列变成无限重试。
做法是：失败就重新发一条带 `retryCount` 的消息放回队列，自己正常返回；累计 3 次仍失败就投死信队列。

```java
private void handleFailure(String payload, int attempt, boolean simulateFail, Exception e) {
    Map<String, String> headers = new HashMap<>();
    headers.put("retryCount", String.valueOf(attempt));   // 重试次数必须由发送方重新设

    if (attempt < MAX_RETRY) {          // MAX_RETRY = 3
        // 重新发一条放回队列，旧的那条由框架正常 ack 掉
        sender.sendWithHeaders("", MqConst.EXAMPLE_PROFILE_QUEUE, payload, headers);
    } else {
        // 到上限仍失败：投死信，等人工/定时任务处理
        sender.sendWithHeaders(MqConst.EXAMPLE_PROFILE_DLX_EXCHANGE,
                MqConst.EXAMPLE_PROFILE_DEAD_ROUTING_KEY, payload, headers);
    }
}
```

**为什么用"重新发一条"而不是 `basicNack(requeue=true)`：**
重回队列时**消息头不会变**——第一次带 `retryCount=1`，重回后还是 1，永远数不清重试了几次，最后变成无限重试。
想累计次数只能自己重新发一条新的、再 ack 掉旧的。

> 死信队列建议配告警：里面堆消息说明有一批数据一直处理不过去，得有人看。

---

## 秒杀 / 高并发削峰（入口扣库存，抢到的才进 MQ）

**问题：活动开始那一秒几万人同时点"立即抢购"。如果每个请求都直接去数据库扣库存，数据库瞬间被打爆；
同时 100 个人抢 10 件还不能超卖。

**做法：入口先用一次**原子扣减**挡住绝大部分请求（真实项目扣的是 Redis 预扣库存），
抢到的才发消息进队列异步落库，没抢到的**当场返回"已抢光"，根本不进 MQ。
所以 30 个人抢 10 件，队列里只有 10 条。

```java
private void placeOrderRequest(String userId) {
    if (tryDeductStock()) {                                  // 入口原子扣减
        successCount.incrementAndGet();
        sender.send("", MqConst.SECKILL_QUEUE, userId);       // 抢到了才入队，落库交给消费者
    } else {
        rejectCount.incrementAndGet();                        // 没抢到直接返回，不入队
    }
}

/** 防超卖核心：CAS 循环，等价于 update goods set stock = stock - 1 where id = ? and stock > 0 */
private boolean tryDeductStock() {
    while (true) {
        int current = stock.get();
        if (current <= 0) {
            return false;                                     // 已抢光
        }
        if (stock.compareAndSet(current, current - 1)) {
            return true;                                      // 扣减成功
        }
        // CAS 失败：别人抢先改了库存，重读再试
    }
}
```

消费者只负责落库（100ms 一单模拟写订单表），队列里不会有"库存不足"的废消息，所以也不用判库存：

```java
@RabbitListener(queues = MqConst.SECKILL_QUEUE)
public void onOrder(String userId) {
    seckillService.saveOrder(userId);
}
```

**要点：**
- **入口挡流量**：30 人抢 10 件，队列里就是 10 条；把注定失败的请求留给消费者去判，是白费力气；
- **防超卖**：扣减必须原子（CAS，或 SQL `update ... set stock = stock - 1 where stock > 0` 看影响行数）；
  "先 get 再减"在多线程/多实例下一定超卖；
- **削峰**：入口 10ms 返回，数据库由消费者按固定节奏写，不会被瞬时流量冲垮；
- **真实秒杀是两段式**：入口扣 Redis 预扣库存挡流量，异步落库时数据库再扣一次兜底，对不上由定时任务对账补偿；
- 消费端落库失败（连不上库、唯一键冲突）按上一节的套路处理：重试 + 死信，**别抛异常触发无限重试**。