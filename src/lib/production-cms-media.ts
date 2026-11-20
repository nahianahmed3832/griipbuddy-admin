import { adminPath } from './paths';

const uuid = '[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}';
const upload = new RegExp(`^${uuid}\\.(?:jpe?g|png|webp|gif|avif|apng|bmp|tiff?|heic|heif|svg|ico|mp4|webm|ogv|mov)$`);
const publishedImage = new RegExp(`^(?:legacy-s3/)?uploads/${uuid}\\.(?:jpe?g|png|webp|gif|avif|apng|bmp|tiff?|heic|heif)$`);
const publishedVideo = new RegExp(`^(?:uploads|videos)/${uuid}\\.(?:mp4|webm|ogg|ogv|mov)$`);
const optimized = /^catalog\/webp\/([a-f0-9]{2})\/\1[a-f0-9]{62}\.webp$/;
const pinnedPath = '/admin/api/media/catalog/';
const cdn = 'https://d11ml80zmgyrxk.cloudfront.net/';
const legacy = 'https://ggbook.s3.us-east-1.amazonaws.com/rs-leather-bd/';

export function cmsMediaKey(key: string) {
  return upload.test(key) || publishedImage.test(key) || publishedVideo.test(key) || optimized.test(key);
}

export function localCmsUpload(key: string) {
  return upload.test(key);
}

export function productionCmsPreview(value: string) {
  const key = value.startsWith(cdn) ? value.slice(cdn.length)
    : value.startsWith(legacy) ? 'legacy-s3/' + value.slice(legacy.length)
    : value.startsWith('https://devadmin.griipbuddy.com' + pinnedPath) ? value.slice(('https://devadmin.griipbuddy.com' + pinnedPath).length)
    : value.startsWith(pinnedPath) ? value.slice(pinnedPath.length)
    : value;
  return cmsMediaKey(key) ? adminPath('/api/media/catalog/' + key) : value;
}
