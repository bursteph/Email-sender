// ✅ 4rex-Guapo Email Sender - ULTIMATE RAILWAY EDITION (SMTP via .env only)

import express from 'express';
import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import bodyParser from 'body-parser';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const COUNT_FILE = './sent_count.json';
const SENT_LOG = './sent_log.json';
const NOTES_FILE = './notes.json';
const upload = multer({ dest: 'uploads/' });

app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static('public'));

// ✅ Data Storage
let data = fs.existsSync(COUNT_FILE) ? JSON.parse(fs.readFileSync(COUNT_FILE)) : { date: '', count: 0 };
let sentLog = fs.existsSync(SENT_LOG) ? JSON.parse(fs.readFileSync(SENT_LOG)) : [];
let notes = fs.existsSync(NOTES_FILE) ? JSON.parse(fs.readFileSync(NOTES_FILE)) : [];

// ✅ SMTP Config via .env ONLY
let smtpSettings = {
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT || '587'),
  user: process.env.SMTP_USER,
  pass: process.env.SMTP_PASS
};

// ✅ Utility
function resetCounter() {
  const today = new Date().toISOString().slice(0, 10);
  if (data.date !== today) {
    data = { date: today, count: 0 };
    fs.writeFileSync(COUNT_FILE, JSON.stringify(data));
  }
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function insertTrackingPixel(html, id) {
  return html + <img src="/track/${id}" width="1" height="1" style="display:none"/>;
}

async function sendBulkEmail(recipients, subject, html, fromName, attachments) {
  resetCounter();
  const DAILY_LIMIT = 300;
  const WARNING_LIMIT = 200;
  const success = [];
  const failed = [];
  let warningSent = false;

  const transporter = nodemailer.createTransport({
    host: smtpSettings.host,
    port: smtpSettings.port,
    secure: false,
    auth: {
      user: smtpSettings.user,
      pass: smtpSettings.pass
    }
  });

  for (let i = 0; i < recipients.length; i++) {
    const to = recipients[i].trim();
    if (!to) continue;

    if (data.count >= DAILY_LIMIT) {
      failed.push({ to, error: 'Daily limit reached' });
      continue;
    }

    if (data.count >= WARNING_LIMIT && !warningSent) {
      console.log('⚠ WARNING: Over 200 emails sent today!');
      warningSent = true;
    }

    const trackingId = uuidv4();
    const htmlWithPixel = insertTrackingPixel(html, trackingId);

    try {
      await transporter.sendMail({
        from: ${fromName} <${smtpSettings.user}>,
        to,
        subject,
        html: htmlWithPixel,
        text: html.replace(/<[^>]+>/g, ''),
        attachments
      });
      success.push(to);
      data.count++;
      sentLog.push({ to, subject, time: new Date().toISOString(), trackingId });
    } catch (err) {
      failed.push({ to, error: err.message });
    }

    fs.writeFileSync(COUNT_FILE, JSON.stringify(data));
    await delay(2000);
  }

  fs.writeFileSync(SENT_LOG, JSON.stringify(sentLog, null, 2));
  return { success, failed, total: success.length + failed.length };
}

// ✅ Frontend Form
app.get('/', (req, res) => {
  const noteOptions = notes.map(note => <option value="${note.body.replace(/"/g, '&quot;')}">${note.title}</option>).join('');
  res.send(`
    <html>
    <head>
      <title>4rex-Guapo Email Sender</title>
      <script src="https://cdn.ckeditor.com/4.25.1/full-all/ckeditor.js"></script>
    </head>
    <body style="font-family:Arial; padding:20px">
      <form method="POST" action="/send" enctype="multipart/form-data" onsubmit="return handlePreview()" style="max-width:800px; margin:auto">
        <h2>📨 Advanced Email Sender</h2>
        <label>Sender Name:</label>
        <input name="fromName" placeholder="e.g. Naomi from Heaven Spa" style="width:100%; padding:10px"/><br/><br/>

        <label>Recipients:</label>
        <textarea name="emails" rows="6" required style="width:100%; padding:10px"></textarea><br/>

        <label>Subject:</label>
        <input name="subject" required style="width:100%; padding:10px"/><br/>

        <label>Use Template:</label>
        <select onchange="CKEDITOR.instances.editor.setData(this.value)" style="width:100%; padding:10px">
          <option disabled selected>Select template</option>
          ${noteOptions}
        </select>

        <label>Message:</label>
        <textarea name="body" id="editor" required></textarea>

        <label>Attachments:</label>
        <input type="file" name="attachments" multiple/><br/><br/>

        <input type="hidden" name="previewHtml" id="previewHtml" />
        <button type="submit">🚀 Send</button>
        <button type="button" onclick="handlePreviewAndPost()">👁 Preview</button>
      </form>

      <script>
        CKEDITOR.replace('editor', {
          toolbar: [
            { name: 'clipboard', items: ['Undo', 'Redo'] },
            { name: 'styles', items: ['Font', 'FontSize'] },
            { name: 'basicstyles', items: ['Bold', 'Italic', 'Underline', 'Strike', '-', 'RemoveFormat'] },
            { name: 'colors', items: ['TextColor', 'BGColor'] },
            { name: 'paragraph', items: ['NumberedList', 'BulletedList', '-', 'Blockquote'] },
            { name: 'insert', items: ['Image', 'Table', 'HorizontalRule', 'CodeSnippet'] },
            { name: 'tools', items: ['Maximize', 'Source'] }
          ],
          extraPlugins: 'codesnippet',
          height: 300
        });

        function handlePreview() {
          document.getElementById('previewHtml').value = CKEDITOR.instances.editor.getData();
          return true;
        }

        function handlePreviewAndPost() {
          const html = CKEDITOR.instances.editor.getData();
          fetch('/preview', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ body: html })
          })
            .then(res => res.text())
            .then(html => {
              const preview = window.open('', '_blank');
              preview.document.write(html);
            });
        }
      </script>
    </body>
    </html>
  `);
});

// ✅ Notes API
app.post('/save-note', (req, res) => {
  notes.push({ title: req.body.title, body: req.body.body });
  fs.writeFileSync(NOTES_FILE, JSON.stringify(notes, null, 2));
  res.redirect('/');
});

app.post('/edit-note', (req, res) => {
  const i = notes.findIndex(n => n.title === req.body.original);
  if (i !== -1) {
    notes[i] = { title: req.body.title, body: req.body.body };
    fs.writeFileSync(NOTES_FILE, JSON.stringify(notes, null, 2));
  }
  res.redirect('/');
});

// ✅ Open Tracker
app.get('/track/:id', (req, res) => {
  const id = req.params.id;
  const match = sentLog.find(log => log.trackingId === id);
  if (match) {
    match.opened = true;
    match.openTime = new Date().toISOString();
    fs.writeFileSync(SENT_LOG, JSON.stringify(sentLog, null, 2));
  }
  res.set('Content-Type', 'image/gif');
  res.send(Buffer.from("R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==", 'base64'));
});

// ✅ Email Send Endpoint
app.post('/send', upload.array('attachments'), async (req, res) => {
  const recipients = req.body.emails.split(/\r?\n/);
  const attachments = req.files.map(file => ({ filename: file.originalname, path: file.path }));
  const { success, failed, total } = await sendBulkEmail(
    recipients,
    req.body.subject,
    req.body.previewHtml || req.body.body,
    req.body.fromName,
    attachments
  );
  res.send(`<div style="font-family:Arial; padding:20px; max-width:800px; margin:auto"> <h3>✅ Email Send Report</h3> <p><strong>Total:</strong> ${total}</p> <p><strong>Sent:</strong> ${success.length}</p><ul style="color:green">${success.map(e => <li>${e}</li>).join('')}</ul><p><strong>Failed:</strong> ${failed.length}</p><ul style="color:red">${failed.map(e => <li>${e.to}: ${e.error}</li>).join('')}</ul> <a href="/">⬅ Back</a> </div>`);
});

// ✅ Preview Renderer
app.post('/preview', (req, res) => {
  const html = req.body.body || '';
  res.send(<div style="font-family:Arial;padding:20px;max-width:800px;margin:auto;border:1px solid #ccc">${html}</div><a href="/">⬅ Back</a>);
});

app.listen(PORT, () => console.log(✅ 4rex-Guapo Sender running on http://localhost:${PORT}));