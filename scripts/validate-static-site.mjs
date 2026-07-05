import { access, readdir, readFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { extname } from 'node:path';
import vm from 'node:vm';

const requiredFiles = [
  'index.html',
  'shop.html',
  'checkout.html',
  'app.js',
  'marketplace.js',
  'style.css',
  'firebase.json',
  'database.rules.json',
  'app.webmanifest',
  'service-worker.js',
  'health.json',
  'robots.txt',
  'sitemap.xml'
];

const jsonFiles = ['firebase.json', 'app.webmanifest', 'health.json'];
const jsFiles = ['app.js', 'marketplace.js', 'firebase-config.js', 'service-worker.js'];
const errors = [];

async function assertReadable(file) {
  try {
    await access(file, constants.R_OK);
  } catch {
    errors.push(`Missing required file: ${file}`);
  }
}

async function validateJson(file) {
  try {
    JSON.parse(await readFile(file, 'utf8'));
  } catch (error) {
    errors.push(`Invalid JSON in ${file}: ${error.message}`);
  }
}

async function validateJavaScript(file) {
  try {
    const source = await readFile(file, 'utf8');
    new vm.Script(source, { filename: file });
  } catch (error) {
    errors.push(`Invalid JavaScript in ${file}: ${error.message}`);
  }
}

async function validateHtmlPages() {
  const files = (await readdir('.')).filter(file => extname(file) === '.html');
  for (const file of files) {
    const html = await readFile(file, 'utf8');
    if (!html.includes('<meta name="viewport"')) errors.push(`${file} is missing a viewport meta tag`);
    if (!html.includes('rel="stylesheet" href="style.css"')) errors.push(`${file} is missing style.css`);
    if (!html.includes('rel="manifest" href="app.webmanifest"')) errors.push(`${file} is missing app.webmanifest`);
    if (!html.includes('<script src="app.js"')) errors.push(`${file} is missing app.js`);
  }
}

async function validateFirebaseHosting() {
  const firebaseConfig = JSON.parse(await readFile('firebase.json', 'utf8'));
  const hosting = firebaseConfig.hosting;
  if (!hosting?.public) errors.push('firebase.json is missing hosting.public');
  if (!hosting?.headers?.length) errors.push('firebase.json is missing hosting headers');
  if (!hosting?.rewrites?.some(rule => rule.source === '/health')) errors.push('firebase.json is missing /health rewrite');
}

await Promise.all(requiredFiles.map(assertReadable));
await Promise.all(jsonFiles.map(validateJson));
await Promise.all(jsFiles.map(validateJavaScript));
await validateHtmlPages();
await validateFirebaseHosting();

if (errors.length) {
  console.error('Static build validation failed:');
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log('Static build validation passed. Firebase Hosting bundle is ready to deploy.');
