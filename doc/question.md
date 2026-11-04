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

## 阿里云服务器应用部署

CentOS 7.9 / 2 核 1.7G / Docker 26 + Compose v2。五个应用各自独立目录 + compose 文件，均为 `restart: unless-stopped`，配合 Docker 服务 enabled 实现开机自启。

| 应用       | 用途                                  | 本地访问                                   |
| -------- | ----------------------------------- | -------------------------------------- |
| AstrBot  | QQ 机器人框架，aiocqhttp 反向 WS 接 SnowLuma | http://127.0.0.1:6185                  |
| SnowLuma | QQ 协议端，noVNC 扫码登录                   | http://127.0.0.1:6081（桌面）/ 5099（WebUI） |
| Netdata  | 系统与容器监控                             | http://127.0.0.1:19999                 |
| Dozzle   | 容器日志查看                              | http://127.0.0.1:8888                  |
| Dockge   | compose 可视化管理                       | http://127.0.0.1:5001                  |

目录：`/opt/qqbot`、`/opt/netdata`、`/opt/dozzle`、`/opt/dockge`。所有 Web 端口只绑 127.0.0.1，不对公网开放。

**本地连接**：运行 `start-qqbot-tunnel.ps1`，前台保持、Ctrl+C 断开；脚本自动准备密钥、检查端口占用、建立六路转发。

**踩坑**：

- **镜像 `latest` 会拉到旧版**：加速站缓存不一致，Dozzle 的 latest 曾给出 2021 年的 v3.10.1。部署要固定版本号并核对 `docker inspect` 的 `Created`。
- **SnowLuma 初始密码每次重建都变**：用 `docker logs snowluma | grep "initial credentials" | tail -1` 取，登录后第一件事是改密。
- **noVNC 报密码错误不一定是密码错**：容器内 x11vnc 没开 `-shared`，同一时刻只允许一个客户端，旧会话没释放时新连接被拒。
- **Dockge 管理员无法预置**：setup 走的是 socket.io 事件不是 REST 接口，只能在首次打开页面时手动设置。
- **PowerShell 脚本要存 UTF-8 with BOM**：否则 PowerShell 5.1 按 GBK 解码中文，报「字符串缺少终止符」。
- **`docker exec` 偶发挂起**：命令前加 `timeout`。
- **阿里云安全组**：服务器内部监听正常但外网超时，基本都是安全组没放行。

---
## 服务器各应用 docker-compose 配置

五个 stack 各自独立目录、独立 compose 文件，互不干扰。统一 `restart: unless-stopped`，配合 Docker 服务 enabled 实现开机自启与崩溃重启；Web 端口只绑 `127.0.0.1`。
### qqbot：AstrBot + SnowLuma

**作用**：SnowLuma 是 QQ 协议端（跑 NTQQ + noVNC 桌面用于扫码），AstrBot 是机器人框架，通过 aiocqhttp 反向 WS 连接 SnowLuma。两者建在同一个 bridge 网络 `qqbot` 上，靠服务名互访，网关端口（3000/3001/6199）不发布到宿主机。

**关键配置**：

- `shm_size: 1gb`、`cap_add: SYS_PTRACE`、`seccomp=unconfined`：Chromium 运行必需，少了起不来
- `VNC_PASSWD`：noVNC 桌面密码
- `./snowluma/start.sh:/root/start.sh:ro`：覆盖容器内启动脚本，给 x11vnc 补 `-shared`，否则同一时刻只能一个客户端连，重连会被拒并显示成「密码错误」
- 三个命名卷持久化 QQ 登录态、客户端配置与数据，重建容器不丢登录

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

**注意**：AstrBot 宿主端口是 `36185`（映射到容器 6185），隧道和访问地址都要按 36185 算。SnowLuma 用 `latest`，升级时务必固定版本号。

### netdata：系统与容器监控

**作用**：采集宿主机 CPU / 内存 / 磁盘 / 网络，同时通过 cgroup 采集每个容器的资源占用。自带告警，适合盯 swap 和内存趋势。不支持中文。

**关键配置**：

- `network_mode: host` + `pid: host`：要采集宿主网卡和 Docker cgroup，必须共享宿主网络与 PID 命名空间
- `mem_limit: 512m`：自身限制，实测只占 56MB
- `/sys:/host/sys:ro`、`/var/run/docker.sock:ro`：容器监控依赖这两个挂载
- `security_opt: seccomp=unconfined`：CentOS 7 无 apparmor，写 seccomp 即可

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

**注意**：`network_mode: host` 会绕开 compose 的端口绑定，镜像默认监听 `*:19999`，必须手动在 `/etc/netdata/netdata.conf` 写 `[web]` 段 `bind to = 127.0.0.1`，否则监控数据对整个网络可见（Netdata 无认证）。
**界面截图**：
![](static/Pasted%20image%2020261104141025.png)
### dozzle：容器日志

**作用**：Web方式查看所有容器日志，支持实时跟踪、搜索、按容器过滤，并能重启容器。*<u>**注：不支持账号密码登录，无法更新到指定的版本，需使用下方的dockge。**</u>*

**关键配置**：

- `DOZZLE_ENABLE_ACTIONS=true`：开启操作按钮，重启停止
- `/var/run/docker.sock` 挂载**不能加 `:ro`**：重启容器、拉镜像是写操作
- `DOZZLE_FILTER: "status=running"`：只显示运行中的容器
- `DOZZLE_IMAGE_CHECK_MODE=automatic`：自动检查镜像版本，只提示不自动重建

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

**注意**：镜像必须写死版本号，`latest` 在这台机器上会拉到 2021 年的 v3.10.1（镜像加速站缓存）。另外「自动更新」保持关闭，避免半夜重建 SnowLuma 导致密码失效。

**界面截图**：
![](static/Pasted%20image%2020261104140817.png)
### dockge：compose 可视化管理

**作用**：Web 管理所有容器，可查看/编辑 compose 文件、启停重启整个容器、看日志，开了 Console 后还能进容器 shell 执行命令，支持账号密码设置登录，通过docker登录支持自建的docker仓库Harbor等。

**关键配置**：

- `DOCKGE_STACKS_DIR=/opt`：直接接管 `/opt` 下已有的四个 stack，无需迁移目录
- `/opt:/opt`：让容器能读写这些 stack 的目录
- `DOCKGE_ENABLE_CONSOLE=true`：开启容器内终端（1.5.0 起默认关闭）
- `healthcheck: disable: true`：自带健康检查在这台机器上会一直卡 `starting`（exec 超时），关掉避免误判

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

**注意**：首次访问要在页面自己设管理员账号（setup 是 socket.io 事件，没有 REST 接口可预置）。它挂着 docker.sock，拥有全部容器管理权，所以只监听回环。`DOCKGE_STACKS_DIR` 指向 `/opt` 后，`alibabacloud`、`containerd` 这类非 stack 目录也会暴露给容器，但只有含 compose 文件的目录会显示在列表里。

**界面截图**：
![](static/Pasted%20image%2020261104141315.png)

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
