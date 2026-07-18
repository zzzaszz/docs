# 前端
## Volta 固定项目 Node 版本

```bash
# 安装
winget install Volta.Volta

# 查看列表
volta list
```

在项目根目录：

```bash
# 固定 Node 版本
volta pin node@14.21.3

# 固定 npm 版本
volta pin npm@6.14.18
```

---

## npm ci

`package-lock` 里有什么就装什么，比 `npm install` 更严格、更快。

```bash
npm ci
```

---

## 对象去除某 key

```javascript
// 方式一：delete
delete this.queryParams.DateRange;

// 方式二：Vue.$delete（响应式删除）
this.$delete(this.formdata, "navid");
```

---

## 后端传回 JSON 格式化为数组

```javascript
let labeljson = this.formdata.labeljson;
if (Array.isArray(labeljson)) {
  // 本身就是数组，直接用
  this.formdata.labeljson = labeljson;
} else if (typeof labeljson === 'string' && labeljson.trim()) {
  try {
    const parsed = JSON.parse(labeljson);
    this.formdata.labeljson = Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    console.error(e);
    this.formdata.labeljson = [];
  }
} else {
  this.formdata.labeljson = [];
}
```

---

## 将 JSON 格式化为 String 传给后端

```javascript
this.queryParams.scenedata = JSON.stringify([
  {
    field: "Crm_Followview.CiteType",
    fieldtype: 0,
    math: "like",
    value: "CustomerNew",
  },
]);
```

---

## Inks 封装好的格式化时间方法

```javascript
this.$options.filters.dateFormat(row[item.itemcode]);
```

---

## CSS Flex 同一行布局

```css
.goods_header {
  display: flex;
  align-items: center;
}
```

## easytable高度问题
:scroll-width="scrollWidth"
:virtual-scroll-option="virtualScrollOption"
        
```html
      <ve-table
        v-else
        rowKeyFieldName="id"
        :max-height="tableHeight"
        :scroll-width="scrollWidth"
        :columns="columsData"
        :table-data="goodsList"
        border-x
        border-y
        :border-around="true"
        :column-width-resize-option="{ enable: true, minWidth: 60 }"
        :virtual-scroll-option="virtualScrollOption"
      />
```