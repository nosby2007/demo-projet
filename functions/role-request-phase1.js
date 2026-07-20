'use strict';

const { getApps, initializeApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getDatabase } = require('firebase-admin/database');
const { HttpsError, onCall } = require('firebase-functions/v2/https');

if (!getApps().length) initializeApp();
const db = getDatabase();
const DEFAULT_TENANT = 'lamylenoise';
const ACTIVE_STATUSES = new Set(['submitted', 'under_review', 'needs_changes', 'pending', 'approved']);

function clean(value, max = 200) {
  return String(value || '').trim().slice(0, max);
}

function assertRole(value) {
  const role = clean(value, 30);
  if