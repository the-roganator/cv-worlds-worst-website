/**
 * The contact form's rules. A message that passes is thanked for and then forgotten: nothing is stored or sent.
 */
export interface ContactForm {
  name: string;
  email: string;
  message: string;
}

export type ContactErrors = Partial<Record<keyof ContactForm, string>>;

export const MAX_NAME_LENGTH = 100;
export const MAX_MESSAGE_LENGTH = 2000;

/** A name, an @, and a domain that ends the way domains do. */
const EMAIL = /^[a-z0-9._-]+@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,4}$/;

export function readContactForm(fields: URLSearchParams): ContactForm {
  return {
    name: (fields.get('name') ?? '').trim(),
    email: (fields.get('email') ?? '').trim(),
    message: (fields.get('message') ?? '').trim(),
  };
}

export function validateContactForm(form: ContactForm): ContactErrors {
  const errors: ContactErrors = {};
  if (!form.name) errors.name = 'Please tell us your name.';
  else if (form.name.length > MAX_NAME_LENGTH) errors.name = `Please keep your name to ${MAX_NAME_LENGTH} characters.`;
  if (!form.email) errors.email = 'Please give an email address, so that Gerald can reply.';
  else if (form.email.length > 254 || !EMAIL.test(form.email)) {
    errors.email = 'That does not look like an email address. Please check it.';
  }
  if (!form.message) errors.message = 'Please write a message.';
  else if (form.message.length > MAX_MESSAGE_LENGTH) {
    errors.message = `Please keep your message to ${MAX_MESSAGE_LENGTH} characters.`;
  }
  return errors;
}
