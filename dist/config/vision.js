// config/vision.js - DEPRECADO: Ahora usamos OpenAI para visión
// Este archivo se mantiene por compatibilidad pero ya no se usa Google Cloud Vision

console.log('⚠️ vision.js: Google Cloud Vision ha sido reemplazado por OpenAI');
console.log('✅ Las funciones de visión usan OpenAI en googleVisionService.js');

// Cliente mock para evitar errores de importación si algún código aún lo referencia
const mockClient = {
  textDetection: () => {
    console.warn('⚠️ textDetection llamado en cliente mock - usar analyzeImageBufferWithVision de googleVisionService.js');
    return Promise.resolve([{ fullTextAnnotation: { text: '' } }]);
  },
  documentTextDetection: () => {
    console.warn('⚠️ documentTextDetection llamado en cliente mock - usar analyzePdfBufferWithVision de googleVisionService.js');
    return Promise.resolve([{ fullTextAnnotation: { text: '' } }]);
  },
  safeSearchDetection: () => {
    console.warn('⚠️ safeSearchDetection llamado en cliente mock - usar isImageSafe de googleVisionService.js');
    return Promise.resolve([{ safeSearchAnnotation: { adult: 'VERY_UNLIKELY', violence: 'VERY_UNLIKELY', racy: 'VERY_UNLIKELY' } }]);
  },
  objectLocalization: () => {
    console.warn('⚠️ objectLocalization llamado en cliente mock - usar analyzeImageComplete de googleVisionService.js');
    return Promise.resolve([{ localizedObjectAnnotations: [] }]);
  },
  labelDetection: () => {
    console.warn('⚠️ labelDetection llamado en cliente mock - usar analyzeImageComplete de googleVisionService.js');
    return Promise.resolve([{ labelAnnotations: [] }]);
  },
  logoDetection: () => {
    console.warn('⚠️ logoDetection llamado en cliente mock - usar analyzeImageComplete de googleVisionService.js');
    return Promise.resolve([{ logoAnnotations: [] }]);
  },
  faceDetection: () => {
    console.warn('⚠️ faceDetection llamado en cliente mock - usar analyzeImageComplete de googleVisionService.js');
    return Promise.resolve([{ faceAnnotations: [] }]);
  },
  imageProperties: () => {
    console.warn('⚠️ imageProperties llamado en cliente mock - usar analyzeImageComplete de googleVisionService.js');
    return Promise.resolve([{ imagePropertiesAnnotation: { dominantColors: { colors: [] } } }]);
  },
  landmarkDetection: () => {
    console.warn('⚠️ landmarkDetection llamado en cliente mock - usar analyzeImageComplete de googleVisionService.js');
    return Promise.resolve([{ landmarkAnnotations: [] }]);
  }
};

export default mockClient;

//# sourceMappingURL=vision.js.map