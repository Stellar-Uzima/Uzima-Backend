const fs = require('fs');
const path = require('path');

const filesToRemove = [
  path.resolve(__dirname, '../src/referral/entities/referral.service.ts'),
  path.resolve(__dirname, '../src/referral/entities/referral.controller.ts'),
  path.resolve(__dirname, '../src/referral/entities/referral.module.ts'),
];

for (const file of filesToRemove) {
  if (fs.existsSync(file)) {
    fs.unlinkSync(file);
    console.log(`Deleted misplaced file: ${file}`);
  }
}
