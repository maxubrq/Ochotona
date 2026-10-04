// Văn bản tiếng Việt. Import entry này là đủ để `format('vi', …)` dùng được;
// khoá vắng rơi về tiếng Anh khi entry tiếng Anh cũng đã được import.
import { registerMessages } from '../format';
import { messages } from '../gen/messages-vi';

registerMessages('vi', messages);

export { messages };
export default messages;
