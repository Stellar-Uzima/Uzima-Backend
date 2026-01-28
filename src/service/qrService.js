import QRCode from 'qrcode';
import bwipjs from 'bwip-js';

// Generate both QR and Barcode
export const generateCodes = async assetId => {
  // QR Code as base64
  const qrCode = await QRCode.toDataURL(assetId);

  // Barcode as base64
  const barcode = await new Promise((resolve, reject) => {
    bwipjs.toBuffer(
      {
        bcid: 'code128', // Barcode type
        text: assetId, // Text to encode
        scale: 3, // 3x scaling
        height: 10, // bar height in mm
        includetext: true, // show text
        textxalign: 'center', // text alignment
      },
      (err, png) => {
        if (err) reject(err);
        else resolve(`data:image/png;base64,${png.toString('base64')}`);
      }
    );
  });

  return { qrCode, barcode };
};
