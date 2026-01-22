const API_VERSIONS = {
  v1: {
    version: '1.0.0',
    deprecated: true,
    deprecationDate: '2025-07-22',
    sunsetDate: '2026-07-22',
    supported: true,
  },
  v2: {
    version: '2.0.0',
    deprecated: false,
    supported: true,
  },
};

const versionDetection = (req, res, next) => {
  const versionMatch = req.path.match(/^\/api\/(v\d+)\//);
  req.apiVersion = versionMatch ? versionMatch[1] : 'v1';
  next();
};

const deprecationWarning = (version) => (req, res, next) => {
  const versionInfo = API_VERSIONS[version];

  if (!versionInfo || !versionInfo.supported) {
    return res.status(410).json({
      error: 'API Version Not Supported',
      message: `API ${version} is no longer supported`,
      currentVersion: 'v2',
    });
  }

  if (versionInfo.deprecated) {
    res.set({
      'X-API-Deprecated': 'true',
      'X-API-Deprecation-Date': versionInfo.deprecationDate,
      'X-API-Sunset-Date': versionInfo.sunsetDate,
      'X-API-Current-Version': 'v2',
      'Link': '</api/v2>; rel="successor-version"',
    });
  }

  res.set({
    'X-API-Version': versionInfo.version,
  });

  next();
};

const getVersionInfo = () => API_VERSIONS;

module.exports = {
  versionDetection,
  deprecationWarning,
  getVersionInfo,
  API_VERSIONS,
};
