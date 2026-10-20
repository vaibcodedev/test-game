// Хук electron-builder (beforeBuild): всё нужное приложению уже собрано esbuild в desktop/out,
// поэтому node_modules проекта не упаковываем и не пересобираем (false = «зависимости обработаны вне electron-builder»).
module.exports = async () => false;
