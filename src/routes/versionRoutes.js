import express from 'express';
import { getVersionInfo } from '../middleware/apiVersion.js';

const router = express.Router();

router.get('/version', (req, res) => {
  const versions = getVersionInfo();
  const supportedVersions = Object.entries(versions)
    .filter(([, info]) => info.supported)
    .map(([key, info]) => ({
      version: key,
      number: info.version,
      deprecated: info.deprecated,
      deprecationDate: info.deprecationDate,
      sunsetDate: info.sunsetDate,
    }));

  const currentVersion =
    supportedVersions.find(v => !v.deprecated) || supportedVersions[supportedVersions.length - 1];

  res.json({
    current: currentVersion.version,
    supported: supportedVersions,
    deprecationPolicy: 'Deprecated versions are supported for 12 months after deprecation date',
  });
});

export default router;
