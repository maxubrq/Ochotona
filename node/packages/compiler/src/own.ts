/**
 * Gán thuộc tính riêng kể cả khi khoá là `__proto__`: tên queue, luồng và khoá
 * argument do người dùng hoặc broker đặt, gán thường sẽ đổi prototype thay vì
 * thêm khoá.
 */
export function setOwn<T>(o: Record<string, T>, key: string, value: T): void {
  Object.defineProperty(o, key, {
    value,
    enumerable: true,
    writable: true,
    configurable: true,
  });
}
