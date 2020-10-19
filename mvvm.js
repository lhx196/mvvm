// 中间层存储订阅者 发布者通知中间层，中间层通知所有订阅者
class Dep {
  constructor() {
    this.subs = []; // 存放所有watcher
  }
  // 订阅
  addSub(watch) {
    this.subs.push(watch);
  }
  // 发布
  notify() {
    this.subs.forEach((watch) => {
      watch.update();
    });
  }
}

// vm.$watch(vm,'info.name',newVal => {}) 观察者
class Watcher {
  constructor(vm, expr, cb) {
    this.vm = vm;
    this.expr = expr;
    this.cb = cb;
    // 存储旧值比对是否更新
    this.oldValue = this.getVal();
  }
  getVal() {
    //初始化取旧值
    Dep.target = this;
    let value = ConpileUtil.getVal(this.vm, this.expr);
    // 释放target，否则$data每一次取值，都会把watch塞入订阅队列
    Dep.target = null;
    return value;
  }
  update() {
    //数据变化后调用观察者updatef方法
    let newValue = ConpileUtil.getVal(this.vm, this.expr);
    if (newValue !== this.oldValue) {
      this.cb(newValue);
    }
  }
}

class Observer {
  constructor(data) {
    this.observer(data);
  }
  observer(data) {
    if (data && typeof data == "object") {
      for (let key in data) {
        this.defineReactive(data, key, data[key]);
      }
    }
  }
  defineReactive(obj, key, value) {
    // 对象嵌套
    this.observer(value);
    let dep = new Dep(); //每一个watcher 建立都会读取值触发get 给每一个属性都加上一个具有发布订阅功能 把每一个watcher都往dep里塞
    Object.defineProperty(obj, key, {
      get() {
        // 创建watch时会读取对应内容，此时watcher已经挂载Dep上，创建观察者的同时作出订阅
        Dep.target && dep.addSub(Dep.target);
        return value;
      },
      set: (newValue) => {
        if (newValue != value) {
          this.observer(newValue);
          value = newValue;
          dep.notify();
        }
      },
    });
  }
}

class Compiler {
  constructor(el, vm) {
    // 判断el是否元素
    this.el = this.isElementNode(el) ? el : document.querySelector(el);
    this.vm = vm;

    // 节点放入内存
    let fragment = this.nodefragment(this.el);

    // 节点内容替换

    // 编译模板 --筛选带 v- {{}}
    this.compile(fragment);
    // 内容塞进页面
    this.el.appendChild(fragment);
  }
  isDirective(attrName) {
    // 判断是否带v-指令
    return attrName.startsWith("v-");
  }
  // 编译元素方法
  compileElement(node) {
    let attributes = node.attributes;
    [...attributes].forEach((attr) => {
      let { name, value: expr } = attr; // v-modal="info.name" v-on:click
      if (this.isDirective(name)) {
        let [, directive] = name.split("-");
        let [directiveName, eventName] = directive.split(":");
        ConpileUtil[directiveName](node, expr, this.vm, eventName); // 当前节点，表达式的值，获取实例存放数据
      }
    });
  }
  // 编译文本方法
  compileText(node) {
    let content = node.textContent;
    if (/\{\{(.+?)\}\}/.test(content)) {
      ConpileUtil["text"](node, content, this.vm);
    }
  }

  // 核心编译方法
  compile(node) {
    let childNodes = node.childNodes;
    [...childNodes].forEach((child) => {
      // 判断元素节点
      if (this.isElementNode(child)) {
        this.compileElement(child);
        // 如果是元素再次编译子节点
        this.compile(child);
      } else {
        this.compileText(child);
      }
    });
  }

  nodefragment(node) {
    let fragment = document.createDocumentFragment();
    let firstChild;
    while ((firstChild = node.firstChild)) {
      fragment.appendChild(firstChild);
    }
    return fragment;
  }

  isElementNode(node) {
    return node.nodeType === 1;
  }
}

// 渲染dom方法类
ConpileUtil = {
  // 获取$data属性方法
  getVal(vm, expr) {
    // vm.$data  info.name
    return expr.split(".").reduce((data, current) => {
      return data[current];
    }, vm.$data);
  },
  // 设置$data属性方法
  setVal(vm, expr, value) {
    expr.split(".").reduce((data, current, index, arr) => {
      if (arr.length == index + 1) {
        data[current] = value;
      }
      return data[current];
    }, vm.$data);
  },
  on(node, expr, vm, eventName) {
    node.addEventListener(eventName, (e) => {
      vm[expr].call(vm, e);
    });
  },
  // 解析v-modal指令
  modal(node, expr, vm) {
    // node节点 expr表达式的值(vm存放值的key) vm当前实例
    // 输入框赋值value
    // 数据变动时,再次调渲染视图
    new Watcher(vm, expr, (newVal) => {
      // 加观察者
      this.updater["modalUpdater"](node, newVal);
    });
    node.addEventListener("input", (e) => {
      let newVal = e.target.value;
      this.setVal(vm, expr, newVal);
    });
    let value = this.getVal(vm, expr);
    this.updater["modalUpdater"](node, value);
  },
  // 解析v-html指令
  html() {
    // node.innerHtml
  },
  getContentValue(vm, expr) {
    return expr.replace(/\{\{(.+?)\}\}/g, (...args) => {
      return this.getVal(vm, args[1]);
    });
  },
  // 解析胡子语法文本
  text(node, expr, vm) {
    // {{a}}  {{b}} 一行多个
    let content = expr.replace(/\{\{(.+?)\}\}/g, (...args) => {
      //repalce每个模板，被匹配的内容，坐标，完整字符串  {{info.name}} info.name 0 {{info.name}} , {{info.desc}} {{info.desc}} info.desc 16 {{info.name}} , {{info.desc}}

      // 数据变动时,再次调渲染视图
      new Watcher(vm, args[1], () => {
        this.updater["textUpdater"](node, this.getContentValue(vm, expr)); //返回一个全的字符串替换
      });
      return this.getVal(vm, args[1]);
    });
    this.updater["textUpdater"](node, content);
  },
  updater: {
    //操作dom更新方法
    modalUpdater(node, value) {
      node.value = value;
    },
    htmlUpdater() {},
    textUpdater(node, value) {
      node.textContent = value;
    },
  },
};

// 基类
class Vue {
  constructor(options) {
    this.$el = options.el;
    this.$data = options.data;
    let computed = options.computed;
    let method = options.method;

    if (this.$el) {
      // 把所有数据劫持
      new Observer(this.$data);

      // 把computed代理到this.$data上,下方编译时会统拦截
      for (let key in computed) {
        Object.defineProperty(this.$data, key, {
          get: () => {
            // this指向实例，call指定this后，computed函数读取this.info时 数据经过proxyVm代理
            return computed[key].call(this);
          },
        });
      }

      for (let key in method) {
        Object.defineProperty(this, key, {
          get: () => {
            // this指向实例，call指定this后，computed函数读取this.info时 数据经过proxyVm代理
            return method[key];
          },
        });
      }

      // 数据代理 vm取值代理到vm.$data
      this.proxyVm(this.$data);

      // 编译类
      new Compiler(this.$el, this);
    }
  }
  proxyVm(data) {
    for (let key in data) {
      // 无需做递深层代理
      Object.defineProperty(this, key, {
        get() {
          return data[key];
        },
        set(newVal) {
          data[key] = newVal;
        },
      });
    }
  }
}
