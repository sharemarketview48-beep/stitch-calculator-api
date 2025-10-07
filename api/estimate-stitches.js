const sharp = require('sharp');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Only POST allowed' });

  try {
    const { imageBase64, widthInInches, density = 2000, fudge = 10, threshold = 220 } = req.body || {};

    if (!imageBase64 || !widthInInches) {
      return res.status(400).json({ error: 'imageBase64 and widthInInches are required' });
    }

    const base64 = imageBase64.replace(/^data:image\/\w+;base64,/, '');
    const imgBuffer = Buffer.from(base64, 'base64');

    const img = sharp(imgBuffer);
    const metadata = await img.metadata();
    const origW = metadata.width || 1;
    const origH = metadata.height || 1;
    const processWidth = Math.min(800, origW);

    const { data, info } = await img
      .resize({ width: processWidth })
      .greyscale()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const channels = info.channels || 1;
    let covered = 0;
    for (let i = 0; i < data.length; i += channels) {
      const r = data[i];
      const g = channels > 1 ? data[i + 1] : r;
      const b = channels > 2 ? data[i + 2] : r;
      const lum = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
      if (lum < threshold) covered++;
    }

    const totalPixels = info.width * info.height;
    const coverageRatio = covered / totalPixels;
    const heightInches = (widthInInches * origH) / origW;
    const totalAreaSqIn = widthInInches * heightInches;
    const coveredAreaSqIn = totalAreaSqIn * coverageRatio;
    const rawStitches = coveredAreaSqIn * density;
    const finalStitches = Math.round(rawStitches * (1 + (fudge / 100)));

    return res.json({
      stitchCount: finalStitches,
      rawStitches: Math.round(rawStitches),
      coverageRatio,
      coveredAreaSqIn,
      totalAreaSqIn,
      widthInInches,
      heightInches,
      density,
      fudge,
      threshold
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
};

