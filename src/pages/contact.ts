import {
  type ContactErrors,
  type ContactForm,
  MAX_MESSAGE_LENGTH,
  readContactForm,
  validateContactForm,
} from '../contact.ts';
import { html } from '../html.ts';
import type { Reply, Route } from '../http.ts';
import { log } from '../log.ts';
import { page } from './layout.ts';

const EMPTY: ContactForm = { name: '', email: '', message: '' };

function form(status: number, values: ContactForm, errors: ContactErrors): Reply {
  const problem = (field: keyof ContactForm) =>
    errors[field] && html`<p class="field-error" id="${field}-error">${errors[field]}</p>`;
  const describedBy = (field: keyof ContactForm) => errors[field] && html` aria-describedby="${field}-error"`;

  return page(status, {
    title: 'Contact',
    path: '/contact',
    script: 'contact.js',
    body: html`<h1>Write to Gerald</h1>
      <p>
        To buy something, tell us its item number and Gerald will set it aside. Questions are welcome too. He reads
        every message, usually on a Thursday.
      </p>
      ${
        Object.keys(errors).length > 0 &&
        html`<p class="notice" role="alert">We could not take that yet. Please see the notes below.</p>`
      }
      <form method="post" action="/contact" novalidate>
        <label for="name">Your name</label>
        <input type="text" id="name" name="name" value="${values.name}" autocomplete="name"${describedBy('name')}>
        ${problem('name')}
        <label for="email">Your email address</label>
        <input type="email" id="email" name="email" value="${values.email}" autocomplete="email"${describedBy('email')}>
        ${problem('email')}
        <label for="message">Your message</label>
        <textarea id="message" name="message" maxlength="${MAX_MESSAGE_LENGTH}"${describedBy('message')}>${values.message}</textarea>
        <p class="quiet" id="message-room" aria-live="polite"></p>
        ${problem('message')}
        <button type="submit">Send message</button>
      </form>`,
  });
}

export const contactRoutes: Route[] = [
  { method: 'GET', path: '/contact', handle: () => form(200, EMPTY, {}) },
  {
    method: 'POST',
    path: '/contact',
    handle({ body }) {
      const values = readContactForm(new URLSearchParams(body.toString('utf-8')));
      const errors = validateContactForm(values);
      if (Object.keys(errors).length > 0) return form(422, EMPTY, errors);

      // The message goes no further than this: nothing is stored or sent, and nothing about it is logged.
      log.info({ event: 'contact' }, 'message received');
      return page(200, {
        title: 'Thank you',
        path: '/contact',
        body: html`<h1>Thank you</h1>
          <p>Your message has been received. Gerald reads every message, usually on a Thursday.</p>
          <p><a href="/products">Back to the range</a></p>`,
      });
    },
  },
];
