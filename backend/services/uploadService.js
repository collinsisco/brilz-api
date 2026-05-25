const sharp    = require('sharp');
const supabase = require('../config/supabase');
const { v4: uuidv4 } = require('uuid');

const uploadImage = async (buffer, originalname, folder = 'products') => {
  const compressed = await sharp(buffer)
    .resize(800, 800, { fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 82 })
    .toBuffer();
  const filename = `${folder}/${uuidv4()}.webp`;
  const { error } = await supabase.storage.from('brilz-images').upload(filename, compressed, {
    contentType: 'image/webp', upsert: false,
  });
  if (error) throw new Error(`Upload failed: ${error.message}`);
  const { data: { publicUrl } } = supabase.storage.from('brilz-images').getPublicUrl(filename);
  return publicUrl;
};

module.exports = { uploadImage };
