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
## 阿里云服务器应用部署（47.111.113.187）

### 环境与访问方式

| 项       | 值                                              |
| ------- | ---------------------------------------------- |
| 系统      | CentOS Linux 7.9.2009 (Core)，内核 3.10           |
| 配置      | 2 核 / 1.7G 内存 / 40G 磁盘（已有 4G swap）             |
| Docker  | 26.1.4，`systemctl is-enabled docker` = enabled |
| Compose | v2.27.1                                        |
| 其他      | x86_64，cgroup v1，overlay2                      |

**端口策略**：所有 Web 服务只绑 `127.0.0.1`，本地通过 SSH 隧道访问，不对公网暴露。网关端口（AstrBot 6199、SnowLuma 3000/3001）不发布到宿主机，只在 Docker 网络 `qqbot` 内互通。

| 应用 | 用途 | 宿主机端口 | 本地隧道端口 |
|---|---|---|---|
| AstrBot | QQ 机器人框架 | 36185 → 容器 6185 | 127.0.0.1:6185 |
| SnowLuma | QQ 协议端 + noVNC 桌面 | 6081 / 5099 | 127.0.0.1:6081 / 5099 |
| Netdata | 系统与容器监控 | 19999 | 127.0.0.1:19999 |
| Dozzle | 容器日志查看 | 8888 | 127.0.0.1:8888 |
| Dockge | compose 可视化管理 | 5001 | 127.0.0.1:5001 |

本地连接推荐直接用脚本 `start-qqbot-tunnel.ps1` 一键搞定（准备密钥、检查端口占用、建立全部六路转发，详见第八节）。也可以手动执行：

隧道命令（注意 AstrBot 本地 6185 指向服务器 **36185**，不是 6185）：

```powershell
ssh -i ~/.ssh/aliyun_zzz1030.pem -N `
  -o ServerAliveInterval=30 -o ExitOnForwardFailure=yes `
  -L 127.0.0.1:6185:127.0.0.1:36185 `
  -L 127.0.0.1:6081:127.0.0.1:6081 `
  -L 127.0.0.1:5099:127.0.0.1:5099 `
  -L 127.0.0.1:19999:127.0.0.1:19999 `
  -L 127.0.0.1:8888:127.0.0.1:8888 `
  -L 127.0.0.1:5001:127.0.0.1:5001 `
  root@47.111.113.187
```

所有 stack 均为独立目录 + 独立 compose 文件，`restart: unless-stopped`，配合 Docker 服务 enabled 实现开机自启与崩溃自动重启。

---

### 一、AstrBot（QQ 机器人框架）

**介绍**：多平台聊天机器人框架，支持 LLM 对话、插件、多平台适配。本项目用它接 QQ，通过 aiocqhttp（OneBot v11）反向 WebSocket 连接 SnowLuma。

**访问**：http://127.0.0.1:6185（隧道）。初始账号 `astrbot`，初始密码 `plL4gMuDczsz7KPU8CA6s9ON`，首次登录会提示改密。

**编排**：`/opt/qqbot/docker-compose.yml`（与 SnowLuma 同一 stack）

```yaml
services:
  snowluma:
    image: motricseven7/snowluma:latest
    container_name: snowluma
    restart: unless-stopped
    shm_size: 1gb
    ulimits:
      nofile:
        soft: 65536
        hard: 1048576
    cap_add:
      - SYS_PTRACE
    security_opt:
      - seccomp=unconfined
    environment:
      TZ: Asia/Shanghai
      VNC_PASSWD: "xBUruHbj"
      SNOWLUMA_WEBUI_HOST: 0.0.0.0
      SNOWLUMA_WEBUI_PORT: "5099"
      SNOWLUMA_LOG_LEVEL: info
      SNOWLUMA_SCREEN: 1920x1080x24
      SNOWLUMA_HOOK_AUTOLOAD: "1"
      SNOWLUMA_QQ_FLAGS: "--disable-gpu --disable-software-rasterizer --disable-gpu-compositing"
    ports:
      - "127.0.0.1:6081:6081"
      - "127.0.0.1:5099:5099"
    volumes:
      - qq-gateway-data:/app/data
      - qq-client-config:/app/.config
      - qq-client-data:/app/.local/share
      - ./snowluma/start.sh:/root/start.sh:ro
    networks:
      - qqbot

  astrbot:
    image: soulter/astrbot:latest
    container_name: astrbot
    restart: unless-stopped
    environment:
      TZ: Asia/Shanghai
    ports:
      - "36185:6185"
    volumes:
      - ./astrbot/data:/AstrBot/data
    networks:
      - qqbot
    depends_on:
      - snowluma

volumes:
  qq-gateway-data:
  qq-client-config:
  qq-client-data:

networks:
  qqbot:
    driver: bridge
```

**平台配置**：`/opt/qqbot/astrbot/data/cmd_config.json` 的 `platform` 数组：

```json
[{
  "type": "aiocqhttp",
  "enable": true,
  "id": "snowluma",
  "name": "SnowLuma-QQ",
  "ws_reverse_host": "0.0.0.0",
  "ws_reverse_port": 6199,
  "ws_reverse_token": "2chBQXgbJTygy1Fj8MWE0DASoe0ttfK"
}]
```

**踩坑**：

- `cmd_config.json` 带 UTF-8 BOM，脚本读写必须用 `encoding='utf-8-sig'`，否则 JSON 解析失败；原 `platform` 是空数组 `[]`，不自己写进去平台不会启动。
- 6199 是反向 WS 服务端端口，**不需要**发布到宿主机，SnowLuma 通过容器名 `astrbot` 在 Docker 网络内连接即可。
- 容器内没有 `ss`、`netstat`，判断 6199 是否监听要用 `docker exec astrbot python3 -c` 做 socket 探测。
- 镜像 tag 是 `latest`，实际版本 v4.29.3。升级前务必固定版本号，原因见「通用踩坑」的镜像缓存问题。

---

### 二、SnowLuma（QQ 协议端）

**介绍**：基于 NTQQ 协议的 QQ 机器人协议端，提供 OneBot v11 接口（HTTP / 正向 WS / 反向 WS）和一个可通过 noVNC 远程操作的桌面（Chromium），用于扫码登录 QQ。

**访问**：

| 入口 | 地址 | 凭据 |
|---|---|---|
| noVNC 扫码桌面 | http://127.0.0.1:6081 | 密码 `xBUruHbj`（VNC_PASSWD） |
| WebUI 面板 | http://127.0.0.1:5099 | 单框输入访问令牌，即 WebUI 密码 |

WebUI **没有用户名字段**，登录框只有一个「输入访问令牌」，对应 `POST /api/login {"password":"..."}`。初始密码从日志取：

```bash
docker logs snowluma | grep "initial credentials" | tail -1
```

**扫码登录 QQ**：打开 6081 → 输入 VNC 密码 → 在桌面里用手机 QQ 扫码 → 手机确认。登录成功后 SnowLuma 才会创建 OneBot 实例，此时 3000/3001 才开始监听。

**链路配置**：`/app/data/config/onebot.json` 的 `networks.wsClients`：

```json
[{
  "name": "astrbot",
  "url": "ws://astrbot:6199/ws",
  "role": "Universal",
  "accessToken": "2chBQXgbJTygy1Fj8MWE0DASoe0ttfK",
  "reconnectIntervalMs": 5000,
  "enabled": true
}]
```

**踩坑**（重点）：

- **初始密码每次重建都会变**。只要没在 WebUI 里改过密码（`mustChangePassword: true` 还没处理），每次重启/重建容器都会重新生成随机密码。所以首次登录第一件事就是改密，否则下次重建又得去翻日志。
- **noVNC 提示「密码错误」不一定是密码错**。容器内 `/root/start.sh` 启动 x11vnc 时没带 `-shared`，同一时刻只允许一个客户端，旧会话没释放时新连接会被拒绝，noVNC 把这个显示成密码错误。修复是把 `-forever -threads -rfbauth` 改成 `-forever -threads -shared -rfbauth`，并把改好的 start.sh 挂载进容器持久化（否则重建就还原）。
- WebUI 首次登录要同意 EULA/隐私协议，不点同意面板是锁着的。
- 扫码前 `ss -lnt` 看不到 3000/3001 是**正常现象**，OneBot 实例要等 QQ 登录后才创建。
- 容器需要 `shm_size: 1gb`、`SYS_PTRACE`、`seccomp=unconfined`，否则 Chromium 起不来。CentOS 7 没有 apparmor，`security_opt` 写 seccomp 就够，SELinux 为 Disabled，bind mount 不需要 `:z`。
- 内存吃紧：1.7G 内存跑 Chromium 会用到 swap，被 OOM kill 时优先考虑升配。

---

### 三、Netdata（监控）

**介绍**：实时系统监控，采集 CPU、内存、磁盘、网络、进程，以及每个 Docker 容器的 cgroup 指标。自带告警。

**访问**：http://127.0.0.1:19999

**编排**：`/opt/netdata/docker-compose.yml`

```yaml
services:
  netdata:
    image: netdata/netdata:stable
    container_name: netdata
    hostname: iZbp1bb9pv7d5xf05daodgZ
    restart: unless-stopped
    pid: host
    network_mode: host
    mem_limit: 512m
    cap_add:
      - SYS_PTRACE
      - SYS_ADMIN
    security_opt:
      - seccomp=unconfined
    volumes:
      - netdataconfig:/etc/netdata
      - netdatalib:/var/lib/netdata
      - netdatacache:/var/cache/netdata
      - /:/host/root:ro,rslave
      - /etc/passwd:/host/etc/passwd:ro
      - /etc/group:/host/etc/group:ro
      - /etc/localtime:/etc/localtime:ro
      - /proc:/host/proc:ro
      - /sys:/host/sys:ro
      - /etc/os-release:/host/etc/os-release:ro
      - /var/log:/host/var/log:ro
      - /var/run/docker.sock:/var/run/docker.sock:ro

volumes:
  netdataconfig:
  netdatalib:
  netdatacache:
```

**必须手动改绑定地址**。镜像默认监听 `*:19999`，而 Netdata 没有任何认证，任何人能访问就能看到服务器全部运行数据。启动后要往 `/etc/netdata/netdata.conf` 追加：

```ini
[web]
    bind to = 127.0.0.1
```

然后重启容器。

**踩坑**：

- `network_mode: host` 是为了采集宿主机网卡；容器自身端口限制就失效了，只能靠 netdata 自己的 `bind to` 收口。
- 要监控 Docker 容器，必须同时有 `pid: host`、`/sys:/host/sys:ro`、`/var/run/docker.sock:ro`。满足后日志里会出现 `cgroup 'docker_xxx' is called 'astrbot'`，图表名直接是 `cgroup_astrbot.cpu`、`cgroup_snowluma.mem`，而不是一串 sha256。
- 实测资源占用 56MB（`mem_limit` 512m 足够），当前 102 项告警全部 normal。
- 这台机器 swap 已用掉 1G 左右，Netdata 的内存/swap 趋势图是判断是否该升配的主要依据。

---

### 四、Dozzle（日志查看）

**介绍**：轻量 Web 日志查看器，可实时看所有容器日志、搜索、按容器过滤，并支持重启容器、检查镜像更新。

**访问**：http://127.0.0.1:8888

**编排**：`/opt/dozzle/docker-compose.yml`

```yaml
services:
  dozzle:
    image: amir20/dozzle:v11.4.0
    container_name: dozzle
    restart: unless-stopped
    ports:
      - "127.0.0.1:8888:8080"
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
    environment:
      TZ: Asia/Shanghai
      DOZZLE_LEVEL: info
      DOZZLE_FILTER: "status=running"
      DOZZLE_NO_ANALYTICS: "true"
      DOZZLE_DISABLE_SETUP_WIZARD: "true"
      DOZZLE_ENABLE_ACTIONS: "true"
      DOZZLE_IMAGE_CHECK_MODE: "automatic"
```

**踩坑**：

- **`latest` 拉到了 2021 年的旧镜像**。这台服务器 daemon.json 配了 9 个 registry-mirrors，`docker pull amir20/dozzle:latest` 得到的镜像是 `Created=2021-12-01`，实际版本 v3.10.1。改用固定 tag `v11.4.0` 才正常。**部署任何镜像都要固定版本号并核对 `docker inspect` 的 `Created` 时间**。
- `DOZZLE_TAILSIZE` 在 v11 已移除，写了会打 `Unexpected environment variable` 警告。
- 要让「重启容器、检查更新」可用，必须 `DOZZLE_ENABLE_ACTIONS=true`，并且 docker.sock 挂载**不能加 `:ro`**（重启/拉镜像是写操作）。
- `DOZZLE_IMAGE_CHECK_MODE=automatic` 只做镜像版本检查提示，不会自动重建容器；真正的自动更新要配 `DOZZLE_AUTO_UPDATE`，默认建议保持 off，否则凌晨重建 SnowLuma 会让密码失效。
- 验证配置是否生效：

```bash
curl -s http://127.0.0.1:8888/ | sed -n '/config__json/,/<\/script>/p'
```

输出里应有 `"enableActions":true,"enableUpdates":true,"enableShell":false`。

---

### 五、Dockge（compose 编排）

**介绍**：可视化管理 docker compose stack，可编辑 compose 文件、启停/重启 stack、查看日志，1.5.0 起支持容器内终端（Console）。

**访问**：http://127.0.0.1:5001。首次访问会进入 setup 页面，自行设置管理员用户名和密码（Dockge 无默认账号）。

**编排**：`/opt/dockge/docker-compose.yml`

```yaml
services:
  dockge:
    image: louislam/dockge:1.5.0
    container_name: dockge
    restart: unless-stopped
    healthcheck:
      disable: true
    ports:
      - "127.0.0.1:5001:5001"
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
      - ./data:/app/data
      - /opt:/opt
    environment:
      TZ: Asia/Shanghai
      DOCKGE_STACKS_DIR: /opt
      DOCKGE_ENABLE_CONSOLE: "true"
```

`DOCKGE_STACKS_DIR=/opt` 让 Dockge 直接识别 `/opt` 下已有的 `qqbot`、`netdata`、`dozzle`、`dockge` 四个 stack，不用迁移目录（迁移会重建容器，触发 SnowLuma 换密码）。它只显示含 compose 文件的目录。

**踩坑**：

- **管理员账号无法用 API 预置**。`POST /api/setup` 返回 404，setup 实际是 socket.io 事件（`/app/backend/socket-handlers/main-socket-handler.ts:30` 的 `socket.on("setup", ...)`），只能在浏览器首次打开时手动设置。
- 1.5.0 起 **Console 默认关闭**，要在 compose 里加 `DOCKGE_ENABLE_CONSOLE=true` 并重建容器，再刷新页面才会出现终端入口。这个终端等于容器内 root shell，且挂着宿主机的 docker.sock，能操作全部容器，也能 `rm -rf` 掉自己。
- 自带 healthcheck（`extra/healthcheck`）在这台机器上会一直卡在 `starting`，日志是 `timed out starting health check`（Docker 启动 exec 超时），已用 `healthcheck.disable: true` 关掉，不影响功能。
- 重建 Dockge 容器不会踢掉登录状态，JWT secret 存在 `/opt/dockge/data/` 的 sqlite 里。
- 与 Dozzle 同理，它拥有容器管理权，只监听回环、走隧道。

---

### 六、通用踩坑

**1. 镜像加速站会缓存旧 `latest`**

daemon.json 配了多个 registry-mirrors，`latest` 和具体版本 tag 的缓存行为不一致，可能拉到几年前的镜像。规避方法：

```bash
docker pull <image>:<具体版本>
docker inspect --format '{{.Created}}' <image>:<tag>   # 核对创建时间
```

**2. 隧道端口和宿主机端口不是一回事**

AstrBot 容器内是 6185，但 compose 映射成宿主机 `36185:6185`，隧道必须写 `-L 127.0.0.1:6185:127.0.0.1:36185`。改过 compose 端口后要同步改隧道，否则本地连不上。

**3. 2G 内存跑 Chromium 会吃 swap**

SnowLuma 的 Chromium + AstrBot 常驻约 900M，swap 已用 1G 左右。内存紧张时优先用 Netdata 看趋势，必要时升配。

**4. 阿里云安全组**

服务器内部 `ss -lntp` 显示 `*:36185` 监听、本机访问 200，但外网超时，说明挡在安全组。需要放行对应端口（TCP）后外网才能通。firewalld 为 inactive、iptables INPUT ACCEPT，服务器侧无拦截。

**5. Windows 运行 PowerShell 脚本报「字符串缺少终止符」**

脚本如果是**无 BOM 的 UTF-8**，Windows PowerShell 5.1 会按本地 GBK 解码，中文注释乱码导致引号配对错乱。写文件时指定 BOM：

```powershell
[System.IO.File]::WriteAllText($path, $content, (New-Object System.Text.UTF8Encoding($true)))
```

**6. `docker exec` 偶发挂起**

这台机器上 `docker exec` 有概率卡住不返回（Dockge 的健康检查也因此超时）。命令前统一加 `timeout`：

```bash
timeout 20 docker exec <container> sh -c "..."
```

**7. SSH 密钥权限**

Windows OpenSSH 对 pem 文件权限校验严格，会报 `UNPROTECTED PRIVATE KEY FILE`。把密钥复制到 `~/.ssh/` 并收窄权限：

```powershell
icacls "$env:USERPROFILE\.ssh\aliyun_zzz1030.pem" /inheritance:r
icacls "$env:USERPROFILE\.ssh\aliyun_zzz1030.pem" /grant:r "$env:USERNAME:F"
```

---

### 七、运维速查

```bash
# 全部 stack 状态
for d in qqbot netdata dozzle dockge; do echo "== $d =="; (cd /opt/$d && docker compose ps); done

# 启停单个 stack
cd /opt/qqbot && docker compose up -d
cd /opt/qqbot && docker compose restart snowluma
cd /opt/netdata && docker compose restart netdata

# 日志
docker logs -f astrbot
docker logs --tail 100 snowluma
docker logs 2>&1 snowluma | grep "initial credentials" | tail -1   # 取当前初始密码

# 确认端口没有对公网暴露
ss -lntp | grep -E ":(5001|8888|19999|5099|6081|6185|6199|3000|3001)\b"

# 内存与容器资源
free -h
docker stats --no-stream
```

**升级原则**：先确认新版版本号 → `docker compose pull` 前把 tag 改成具体版本 → 升级 SnowLuma 前先确认已在 WebUI 改过密码，否则密码会重新随机生成。
---

### 八、本地连接脚本 start-qqbot-tunnel.ps1

**位置**：`D:\0-caoshi\start-qqbot-tunnel.ps1`

**用法**：

```powershell
powershell -ExecutionPolicy Bypass -File D:\0-caoshi\start-qqbot-tunnel.ps1
```

窗口保持打开就是隧道在线，**按 Ctrl+C 断开**，六个本地端口随之释放。

**作用**：一条命令完成「准备密钥 → 检查端口占用 → 建立六路转发 → 前台保持」。

**脚本全文**：

```powershell
# 建立到阿里云 QQ 机器人服务器 (47.111.113.187) 的 SSH 隧道
# 用途：本地访问 AstrBot 后台 / SnowLuma WebUI / noVNC 扫码桌面 / Netdata 监控 / Dozzle 日志 / Dockge 编排，服务器端口不对公网开放
# 用法：powershell -ExecutionPolicy Bypass -File .\start-qqbot-tunnel.ps1
# 停止：在运行窗口按 Ctrl+C

$ErrorActionPreference = "Stop"

$keySrc  = "D:\0-caoshi\_zzz1030.pem"
$keyDst  = "$env:USERPROFILE\.ssh\aliyun_zzz1030.pem"
$server  = "root@47.111.113.187"

# 1. 准备密钥（OpenSSH 要求私钥不可被其他用户读取）
if (-not (Test-Path $keyDst)) {
    if (-not (Test-Path $keySrc)) {
        Write-Host "找不到密钥文件: $keySrc" -ForegroundColor Red
        exit 1
    }
    New-Item -ItemType Directory -Force "$env:USERPROFILE\.ssh" | Out-Null
    Copy-Item $keySrc $keyDst -Force
    icacls $keyDst /inheritance:r | Out-Null
    icacls $keyDst /grant:r "$($env:USERNAME):F" | Out-Null
    Write-Host "已准备密钥: $keyDst" -ForegroundColor Green
}

# 2. 检查本地端口是否被占用
$ports = @{ 6185 = "AstrBot WebUI"; 6081 = "SnowLuma noVNC"; 5099 = "SnowLuma WebUI"; 19999 = "Netdata"; 8888 = "Dozzle"; 5001 = "Dockge" }
foreach ($p in $ports.Keys) {
    if (Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue) {
        Write-Host "端口 $p ($($ports[$p])) 已被占用，请先关闭占用程序。" -ForegroundColor Yellow
        exit 1
    }
}

Write-Host "隧道建立中，本地访问地址：" -ForegroundColor Cyan
Write-Host "  AstrBot 后台      http://127.0.0.1:6185"
Write-Host "  SnowLuma noVNC    http://127.0.0.1:6081   (扫码登录 QQ)"
Write-Host "  SnowLuma WebUI    http://127.0.0.1:5099"
Write-Host "  Netdata 监控      http://127.0.0.1:19999"
Write-Host "  Dozzle 日志       http://127.0.0.1:8888"
Write-Host "  Dockge 编排       http://127.0.0.1:5001"
Write-Host "按 Ctrl+C 断开隧道。" -ForegroundColor DarkGray

# 3. 前台保持隧道（断开后端口随之释放）
ssh -i $keyDst -N `
    -o StrictHostKeyChecking=no `
    -o ServerAliveInterval=30 `
    -o ServerAliveCountMax=3 `
    -o ExitOnForwardFailure=yes `
    -L 127.0.0.1:6185:127.0.0.1:36185 `
    -L 127.0.0.1:6081:127.0.0.1:6081 `
    -L 127.0.0.1:5099:127.0.0.1:5099 `
    -L 127.0.0.1:19999:127.0.0.1:19999 `
    -L 127.0.0.1:8888:127.0.0.1:8888 `
    -L 127.0.0.1:5001:127.0.0.1:5001 `
    $server
```

**每一段解决的问题**：

1. **密钥权限**：Windows OpenSSH 会拒绝权限过宽的私钥（报 `UNPROTECTED PRIVATE KEY FILE`）。脚本首次运行把工作区的 `_zzz1030.pem` 复制到 `~/.ssh/aliyun_zzz1030.pem`，再用 `icacls /inheritance:r` + `grant:r <用户>:F` 收窄到只有当前用户可读。工作区里的原文件不动。
2. **端口占用预检**：六个本地端口任一被占用就直接退出并提示是哪个服务占的，避免 `bind: Address already in use` 这种看不出所以然的报错。
3. **保活与失败退出**：`ServerAliveInterval=30` + `ServerAliveCountMax=3` 让网络抖动能在 90 秒内自愈；`ExitOnForwardFailure=yes` 保证端口转发建不起来时直接退出，不会出现「隧道连着但其实没转发」的假状态。
4. **前台运行**：脚本不把 ssh 丢后台，关掉窗口或 Ctrl+C 就是断开，不会留下看不见的孤儿进程。

**端口对照（本地 → 服务器）**：

| 本地监听            | 服务器目标           | 服务                        |
| --------------- | --------------- | ------------------------- |
| 127.0.0.1:6185  | 127.0.0.1:36185 | AstrBot 后台（**注意不是 6185**） |
| 127.0.0.1:6081  | 127.0.0.1:6081  | SnowLuma noVNC（扫码登录 QQ）   |
| 127.0.0.1:5099  | 127.0.0.1:5099  | SnowLuma WebUI            |
| 127.0.0.1:19999 | 127.0.0.1:19999 | Netdata 监控                |
| 127.0.0.1:8888  | 127.0.0.1:8888  | Dozzle 日志                 |
| 127.0.0.1:5001  | 127.0.0.1:5001  | Dockge 编排                 |

**使用注意**：

- 脚本必须**前台运行**。想开机自动连，可以给它建计划任务，或用 `Start-Process powershell -ArgumentList "-File <路径>"` 起一个独立窗口。
- 端口占用检查依赖 `Get-NetTCPConnection`，Windows 8 / Server 2012 及以上才有。
- 服务器侧改了 compose 端口后，要同步改脚本里的 `-L` 参数和 `$ports` 表，否则会出现「本地能连但打开是空白/404」。

**常见问题**：

| 现象                               | 原因                                                                | 处理                                                                                                                                            |
| -------------------------------- | ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| 运行报「字符串缺少终止符」「缺少 }」，报错行中文乱码      | 文件被存成**无 BOM 的 UTF-8**，Windows PowerShell 5.1 按本地 GBK 解码中文，引号配对错乱 | 用 `[System.IO.File]::WriteAllText($p, $c, (New-Object System.Text.UTF8Encoding($true)))` 存成 UTF-8 with BOM；或用 `pwsh`（PowerShell 7，默认 UTF-8）运行 |
| 提示「端口 X 已被占用」                    | 上次隧道没退干净（窗口关了但 ssh 进程还在），或别的程序占了端口                                | `Get-NetTCPConnection -LocalPort 6185 -State Listen` 查占用 PID，必要时 `Stop-Process -Id <PID>`                                                     |
| 隧道建立成功但页面打不开                     | 服务器侧端口变了（如 AstrBot 从 6185 改到 36185）                               | 上服务器 `docker ps` 看实际宿主机端口，改脚本对应 `-L`                                                                                                          |
| 报 `UNPROTECTED PRIVATE KEY FILE` | 私钥权限过宽                                                            | 脚本会自动修；手动修见第六节第 7 条                                                                                                                           |
| 连一会儿就断                           | 网络 NAT 超时或休眠                                                      | 脚本已带 ServerAlive；仍频繁断就先确认本地网络，再考虑 ssh 加 `-o TCPKeepAlive=yes`                                                                                 |