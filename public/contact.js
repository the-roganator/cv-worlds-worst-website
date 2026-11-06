// Says how much room is left in the message, as it is typed.
const message = document.querySelector('#message');
const room = document.querySelector('#message-count');

function update() {
  const left = message.maxLength - message.value.length;
  room.textContent = left === 1 ? 'Room for one more character.' : `Room for ${left} more characters.`;
}

message.addEventListener('input', update);
update();
