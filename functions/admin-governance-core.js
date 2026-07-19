'use strict';
const PERMISSIONS = Object.freeze(['dashboard.read','access.read','access.write','orders.write','finance.read','finance.write','analytics.write','audit.read','support.read','support.write','risk.read','risk.write','system.read','system.write','campaign.read','campaign.write','delegatedAdmin.read']);
const SET = new Set(PERMISSIONS);
function clean(v,m=160){return String(v??'').trim().slice(0,m)}
function normalizePermissions(values=[]){return [...new Set(Array.isArray(values)?values:[])].map(v=>clean(v,80)).filter(v=>SET.has(v)).sort()}
function maskEmail(value){const [name,domain]=clean(value,200).split('@');return domain?`${name.slice(0,2)}***@${domain}`:''}
function adminSummary(row={}){return{uid:clean(row.uid),name:clean(row.name,120),emailMasked:maskEmail(row.email),status:row.status==='disabled'?'disabled':'active',isSuperAdmin:row.isSuperAdmin===true,permissions:row.isSuperAdmin===true?['*']:normalizePermissions(Object.entries(row.adminPermissions||{}).filter(([,v])=>v===true).map(([k])=>k)),claimsSyncStatus:clean(row.claimsSyncStatus||'complete',40),updatedAt:Number(row.updatedAt||0)}}
function permissionMap(values){return Object.fromEntries(normalizePermissions(values).map(value=>[value,true]))}
module.exports={PERMISSIONS,adminSummary,maskEmail,normalizePermissions,permissionMap};
