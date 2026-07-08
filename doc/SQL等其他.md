# SQL 等其他

## Linux 相关

```bash
cd ~/.openclaw    # 快速进入目录
pwd               # 打印当前完整路径
```

### 端口杀查

```bash
# 端口查看
netstat -ano | findstr :8080

# PID 查看
tasklist | findstr 12345

# 结束进程
taskkill /F /PID 12345
```

> `Shift + 空格` = 全半角切换

---

## 常用递归处理父 ID

### Java 实现

```java
if (StringUtils.isNotBlank(uidgroupguid)) {
    List<MatGroupPojo> list = this.matGoodsService.getAllGroupGuid(loginUser.getTenantid());
    HashSet<String> ids = new HashSet<>();
    findChildren(uidgroupguid, list, ids);
    qpfilter += " AND Mat_Goods.UidGroupGuid IN ('" + String.join("','", ids) + "')";
}

// 递归查所有子节点
public void findChildren(String parentId, List<MatGroupPojo> list, Set<String> ids) {
    ids.add(parentId);
    for (MatGroupPojo group : list) {
        if (parentId.equals(group.getParentid())) {
            findChildren(group.getId(), list, ids);
        }
    }
}
```

### MySQL 递归查询（WITH RECURSIVE）

```sql
WITH RECURSIVE GroupTree AS (
  SELECT id
  FROM Mat_Group
  WHERE id = '1763115194269040640'
  UNION ALL
  SELECT Mat_Group.id
  FROM Mat_Group
  INNER JOIN GroupTree ON Mat_Group.Parentid = GroupTree.id
)

SELECT Mat_Goods.id
FROM Mat_Goods
  LEFT JOIN Mat_Storage ON Mat_Goods.Storeid = Mat_Storage.id
  LEFT JOIN App_Workgroup ON Mat_Goods.Groupid = App_Workgroup.id
  LEFT JOIN Mat_Group ON Mat_Goods.UidGroupGuid = Mat_Group.id
WHERE 1 = 1
  AND Mat_Goods.Tenantid = 'b842c7ca-a02b-4dc6-af43-e4d3e84af592'
  AND Mat_Goods.VirtualItem = 0
  AND Mat_Goods.UidGroupGuid IN (SELECT id FROM GroupTree)
ORDER BY Mat_Goods.CreateDate DESC
LIMIT 20
```

---

## MySQL IFNULL / COALESCE / NULLIF

| 函数 | 说明 |
|------|------|
| `IFNULL(expr1, expr2)` | 如果 expr1 为 NULL，返回 expr2 |
| `NULLIF(expr1, expr2)` | 如果相等返回 NULL，用于除数不为 0，`''` 也会返回 null |
| `COALESCE(v1, v2, ...)` | 返回第一个不为 NULL 的值，SQL 标准 |

```sql
-- 组合判断空字符串
COALESCE(NULLIF(Crm_Leads.Principalid, ''), '未分配') AS Principalid

-- 多默认值
SELECT COALESCE(phone, mobile, '无') FROM user;
```

---

## MySQL 判断日期在今天

```sql
-- CURDATE() → 今天 00:00:00
-- < 明天 00:00:00
-- 覆盖：今天 00:00:00 ～ 23:59:59.999
-- 索引可用，线上首选
AND Crm_Leads.CreateDate >= CURDATE()
AND Crm_Leads.CreateDate < DATE_ADD(CURDATE(), INTERVAL 1 DAY)
```

---

## MySQL 将数字转为字符

把 BigDecimal / 数值转成可控格式，防止 `0E-8`、科学计数法、小数位丢失：

```sql
CAST(Crm_Business.BillTaxAmount AS DECIMAL(18, 2)) AS BillTaxAmount
```

---

## MySQL 常用命令

```sql
-- 查看表结构
SHOW CREATE TABLE App_Workgroup;
SHOW CREATE DATABASE inkssaas;
SHOW INDEX FROM App_Workgroup;
DESC App_Workgroup;

-- 查看表状态
SHOW TABLE STATUS LIKE 'App_Workgroup';

-- 查看列编码
SELECT COLUMN_NAME, CHARACTER_SET_NAME, COLLATION_NAME
FROM information_schema.COLUMNS
WHERE TABLE_NAME = 'App_Workgroup';

-- 查看连接线程
SHOW PROCESSLIST;
SHOW FULL PROCESSLIST;

-- 查看变量
SHOW VARIABLES;
```

---

## MySQL 字段格式不统一导致索引失效

> 比如主外键格式不同，一个是 `utf8mb4` 一个是 `utf8mb3`。

**解决方案：** 全部改为 `utf8mb4`

> **推荐：** id 使用 `BIGINT` 主键，占用 8 字节，B+Tree 极小。

---

## MySQL EXPLAIN 查看 SQL 性能

```sql
EXPLAIN SELECT
  Mat_Goods.id,
  App_Workgroup.GroupName
FROM Mat_Goods
  LEFT JOIN Mat_Storage ON Mat_Goods.Storeid = Mat_Storage.id
  LEFT JOIN App_Workgroup ON Mat_Goods.Groupid = App_Workgroup.id
WHERE 1 = 1
  AND Mat_Goods.Tenantid = 'b842c7ca-a02b-4dc6-af43-e4d3e84af592'
  AND Mat_Goods.VirtualItem = 0
  AND Mat_Goods.EnabledMark = 1
  AND (Mat_Goods.Specid = '' OR Mat_Goods.Specid IS NULL)
  AND Mat_Goods.GoodsState IN ('成品')
ORDER BY Mat_Goods.goodsuid ASC
LIMIT 10
```

### EXPLAIN 字段详解

#### 1、id

| 值 | 含义 |
|----|------|
| 1 | 最外层查询 |
| 2 | 子查询 |
| 数字越大 | 越先执行 |

#### 2、select_type

| 值 | 含义 |
|----|------|
| SIMPLE | 普通查询 |
| PRIMARY | 主查询 |
| SUBQUERY | 子查询 |
| DERIVED | 临时表子查询 |
| UNION | UNION 中的查询 |

#### 3、table

当前访问的表。

#### 4、type（性能排行）

|  type  |  性能   |    含义    |
| :----: | :---: | :------: |
| system | ★★★★★ | 系统表，仅1行  |
| const  | ★★★★★ |  主键唯一查找  |
| eq_ref | ★★★★☆ |   主键关联   |
|  ref   | ★★★★  | 普通索引等值查询 |
| range  | ★★★☆  |   范围扫描   |
| index  |  ★★   |  全索引扫描   |
|  ALL   |   ★   |   全表扫描   |

#### 5、possible_keys

可能使用的索引。

#### 6、key

实际使用的索引。

#### 7、key_len

使用索引长度，一般排查联合索引时很有用。

#### 8、ref

表示索引匹配来源。

#### 9、rows（预计扫描行数）

| rows | 含义 |
|------|------|
| 1 | 极好 |
| 10 | 很好 |
| 100 | 正常 |
| 10000+ | 要关注 |
| 100000+ | 容易慢 |

#### 10、filtered

过滤率。`rows × filtered% ≈ 最终参与下一步的数据量`

#### 11、Extra

| 值 | 含义 |
|----|------|
| `Using where` | 需要额外判断 WHERE 条件，正常 |
| `Using index` | **覆盖索引，最好**，不用回表 |
| `Using filesort` | ⚠️ 额外排序，**危险**（通常来自 ORDER BY 没利用索引） |
| `Using temporary` | ⚠️ 临时表，**危险**（通常来自 GROUP BY、DISTINCT） |
| `Range checked for each record` | 逐行判断是否可使用索引，性能一般 |

---

## 联合索引

### 最左前缀原则

1. 从左到右连续匹配
2. 中间不能断
3. 遇到范围查询基本停止继续匹配

> 范围查询会截断索引：范围查询那个字段本身可用到索引，后面的被截断。

### 示例

假设索引：`(Tenantid, VirtualItem, EnabledMark, GoodsState)`

| SQL 条件 | 是否充分利用索引 |
|----------|-----------------|
| Tenantid | ✅ |
| Tenantid + VirtualItem | ✅ |
| Tenantid + VirtualItem + EnabledMark | ✅ |
| Tenantid + VirtualItem + EnabledMark + GoodsState | ✅ |
| Tenantid + EnabledMark | ❌ 只能用 Tenantid |
| VirtualItem | ❌ |
| GoodsState | ❌ |
| Tenantid + VirtualItem>0 + EnabledMark | ⚠️ 只能用到 VirtualItem（含） |
| Tenantid + VirtualItem + ORDER BY GoodsState | ✅ |
| GoodsName（无索引） | ❌ 全表扫描，不走索引 |

### 单列索引 vs 联合索引

| 维度 | 单列索引 | 联合索引 |
|------|---------|---------|
| WHERE 过滤 | 一般 | **优秀** |
| ORDER BY | 差 | **优秀** |
| LIMIT | 一般 | **优秀** |
| filesort | 容易出现 | **可避免** |
| 回表次数 | 多 | **少** |
| 扫描行数 | 多 | **少** |

---

## MySQL 排查线程、锁、索引

### 查看所有线程（SHOW FULL PROCESSLIST）

| 字段      | 说明                                                                          |
| ------- | --------------------------------------------------------------------------- |
| Id      | 线程 ID，可用于 KILL                                                              |
| User    | 登录用户                                                                        |
| Host    | 客户端 IP 及端口                                                                  |
| db      | 当前数据库                                                                       |
| Command | Sleep（空闲）、Query（执行中）、Connect（建立连接）、Binlog Dump（主从复制）、Daemon（后台）             |
| Time    | 当前状态持续时间（秒）                                                                 |
| State   | Sending data（扫描中）、updating（执行中）、Waiting for table metadata lock（等待 DDL 阻塞）… |
| Info    | 正在执行的 SQL                                                                   |

```sql
SHOW FULL PROCESSLIST;
```

> 如果查询为空（`Empty set`），说明当前没有活动事务。

### 查看 InnoDB 事务

| 字段 | 说明 |
|------|------|
| trx_mysql_thread_id | 对应 ProcessList 的线程 ID |
| trx_started | 事务开始时间 |
| trx_state | 事务状态（RUNNING、LOCK WAIT 等） |
| trx_query | 当前执行 SQL |

```sql
SELECT trx_mysql_thread_id, trx_started, trx_state, trx_query
FROM information_schema.innodb_trx;
```

### 查看 InnoDB 锁信息

```sql
SHOW ENGINE INNODB STATUS\G
```

**重点查看 TRANSACTIONS 段：**

> 例如：`ACTIVE 1570 sec`，`965842 row lock(s)`

重点关注：
- ACTIVE 时间是否过长
- row lock 是否异常大
- 是否存在 LOCK WAIT
- 是否有 DEADLOCK

### 结束线程

```sql
-- 仅终止当前 SQL（连接保留）
KILL QUERY 316017;

-- 断开整个连接（事务自动回滚，锁立即释放）
KILL 316017;
```

### 查看索引

```sql
-- 查看表的索引
SHOW INDEX FROM Buy_AccountItem;

-- 建表语句
SHOW CREATE TABLE Bus_AccountItem;

-- 查看是否走索引
EXPLAIN DELETE FROM Bus_AccountItem WHERE Tenantid = 'xxx';
```

**重点关注 EXPLAIN 字段：**

| 字段 | 理想值 | 说明 |
|------|--------|------|
| type | ref、range、const | 使用索引 |
| key | idx_xxx | 实际使用的索引 |
| rows | 越小越好 | 预计扫描行数 |
| Extra | Using index | 覆盖索引更优 |

**如果出现以下情况，说明没有使用索引：**
- `type = ALL`
- `key = NULL`
- `rows = 366296`

意味着：全表扫描，大表容易导致长事务、锁等待、死锁。

git重新关联仓库