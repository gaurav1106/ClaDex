let keytar;

try {
  keytar = require('keytar');
} catch {
  keytar = null;
}

const SERVICE = 'ClaDex';

async function getSecret(account) {
  if (!keytar || !account) return '';
  return keytar.getPassword(SERVICE, account);
}

async function setSecret(account, value) {
  if (!keytar || !account) return false;
  if (!value) {
    await keytar.deletePassword(SERVICE, account);
    return true;
  }
  await keytar.setPassword(SERVICE, account, value);
  return true;
}

function hasSecureStorage() {
  return Boolean(keytar);
}

module.exports = {
  getSecret,
  setSecret,
  hasSecureStorage
};
