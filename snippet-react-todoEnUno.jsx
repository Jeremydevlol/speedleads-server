
// SNIPPET TODO EN UNO - REACT
import OptimizedVideoComponent from './OptimizedVideoComponent';

// Uso básico
<OptimizedVideoComponent 
  src="/videos/clip-001.mp4"
  poster="/posters/clip-001.jpg"
  className="w-full h-auto"
  autoplay={true}
/>

// Uso avanzado con props adicionales
<OptimizedVideoComponent 
  src="/videos/clip-001.mp4"
  poster="/posters/clip-001.jpg"
  className="w-full h-auto rounded-lg"
  autoplay={true}
  loop={true}
  onLoadedData={() => console.log('Video cargado')}
  onError={(error) => console.error('Error:', error)}
  style={{ maxHeight: '400px' }}
/>

// Para feeds tipo TikTok
const VideoFeed = ({ videos }) => {
  const [activeIndex, setActiveIndex] = useState(0);
  
  return (
    <div className="video-feed">
      {videos.map((video, index) => (
        <OptimizedVideoComponent
          key={video.id}
          src={video.url}
          poster={video.poster}
          autoplay={index === activeIndex} // Solo autoplay el activo
          className="video-item"
        />
      ))}
    </div>
  );
};
