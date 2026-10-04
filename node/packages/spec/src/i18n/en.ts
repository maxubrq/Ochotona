// Văn bản tiếng Anh. Import entry này là đủ để `format('en', …)` dùng được.
import { registerMessages } from '../format';
import { messages } from '../gen/messages-en';

registerMessages('en', messages);

export { messages };
export default messages;
