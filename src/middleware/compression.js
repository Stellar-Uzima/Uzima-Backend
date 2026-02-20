import zlib from 'zlib';

const THRESHOLD = 1024;

const COMPRESSIBLE_TYPES = /^text\/|^application\/(json|javascript|xml|x-www-form-urlencoded)/;

const shouldCompress = (req, res) => {
  const type = res.getHeader('Content-Type');
  if (!type || !COMPRESSIBLE_TYPES.test(type)) return false;
  return true;
};

const getEncoder = acceptEncoding => {
  if (acceptEncoding.includes('br')) {
    return { encoding: 'br', stream: () => zlib.createBrotliCompress() };
  }
  if (acceptEncoding.includes('gzip')) {
    return { encoding: 'gzip', stream: () => zlib.createGzip() };
  }
  if (acceptEncoding.includes('deflate')) {
    return { encoding: 'deflate', stream: () => zlib.createDeflate() };
  }
  return null;
};

export default function compressionMiddleware(req, res, next) {
  const acceptEncoding = req.headers['accept-encoding'] || '';
  const encoder = getEncoder(acceptEncoding);

  if (!encoder) return next();

  res.setHeader('Vary', 'Accept-Encoding');

  const originalWrite = res.write.bind(res);
  const originalEnd = res.end.bind(res);
  const chunks = [];

  res.write = (chunk, encoding, callback) => {
    if (chunk) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, encoding));
    if (typeof encoding === 'function') callback = encoding;
    if (callback) callback();
    return true;
  };

  res.end = (chunk, encoding, callback) => {
    if (chunk) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, encoding));
    if (typeof encoding === 'function') callback = encoding;

    const body = Buffer.concat(chunks);

    if (body.length < THRESHOLD || !shouldCompress(req, res)) {
      res.setHeader('Content-Length', body.length);
      originalWrite(body);
      return originalEnd(callback);
    }

    res.setHeader('Content-Encoding', encoder.encoding);
    res.removeHeader('Content-Length');

    const compressStream = encoder.stream();
    const compressed = [];

    compressStream.on('data', chunk => compressed.push(chunk));
    compressStream.on('end', () => {
      const result = Buffer.concat(compressed);
      res.setHeader('Content-Length', result.length);
      originalWrite(result);
      originalEnd(callback);
    });

    compressStream.end(body);
  };

  next();
}
