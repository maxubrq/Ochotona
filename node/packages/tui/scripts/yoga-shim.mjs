// Thay `yoga-layout` trong binary SEA. Bản gốc nạp WASM bằng top-level await,
// thứ CommonJS (định dạng duy nhất Node 24 SEA nhận) không có. Ở đây WASM được
// nạp qua `ready()` trước khi Ink chạy; Ink chỉ chạm tới Yoga khi đã render.

import { loadYoga } from 'yoga-layout/load';

let yoga = null;

export async function ready() {
  yoga ??= await loadYoga();
}

export default new Proxy(
  {},
  {
    get(_, key) {
      if (yoga === null) throw new Error('yoga-layout used before ready()');
      return yoga[key];
    },
  },
);
