const path = require('path');

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'win32') return;
  const { rcedit } = await import('rcedit');
  const productFilename = context.packager.appInfo.productFilename || context.packager.appInfo.productName || 'ClaDex';
  const exePath = path.join(context.appOutDir, `${productFilename}.exe`);
  const iconPath = path.join(context.packager.projectDir, 'assets', 'icon.ico');
  await rcedit(exePath, {
    icon: iconPath,
    'version-string': {
      CompanyName: 'ClaDex',
      FileDescription: 'ClaDex',
      ProductName: 'ClaDex'
    }
  });
};
