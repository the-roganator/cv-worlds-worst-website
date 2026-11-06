// "Report a problem": sends the report without leaving the page. Without this script the form still works,
// and sends the visitor to a page that thanks them.
const form = document.querySelector('[data-report]');
const status = form?.querySelector('[data-report-status]');

form?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const fields = new FormData(form);
  let message = 'We could not send that. Please try again in a moment.';
  try {
    const response = await fetch('/api/reports', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: fields.get('text'), page: fields.get('page') }),
    });
    if (response.ok) {
      form.reset();
      message = 'Thank you. Gerald will look into it.';
    } else {
      message = (await response.json()).error ?? message;
    }
  } catch {
    // Offline, or the shop is not answering: the message above says so.
  }
  if (status) status.textContent = message;
});
