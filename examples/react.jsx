// React wrapper. Copy dist/creative-heatmap.esm.js and dist/creative-heatmap.css into your app,
// or install this folder as a package (npm install ./creative-heatmap).
import { useEffect, useRef } from 'react';
import { CreativeHeatmap } from 'creative-heatmap';          // or './vendor/creative-heatmap.esm.js'
import 'creative-heatmap/style.css';                          // or './vendor/creative-heatmap.css'

export default function CreativeStudio({ project, creatives = [], aiEndpoint = '/api/creative-analyze', onSave, onAIResult }) {
  const box = useRef(null), studio = useRef(null);

  // create once
  useEffect(() => {
    studio.current = new CreativeHeatmap(box.current, {
      context: project, ai: aiEndpoint ? { endpoint: aiEndpoint } : null, onSave, onAIResult,
    });
    if (creatives.length) studio.current.add(creatives);
    return () => { studio.current.destroy(); studio.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // project switched in the dashboard: update the details used for the AI prompt and the new version
  useEffect(() => { if (studio.current) studio.current.setContext(project); }, [project]);

  return <div ref={box} />;
}

// Usage:
// <CreativeStudio project={{ project: 'Harbourline Residences', brand: 'Harbourline Homes', location: 'Thane' }}
//   creatives={[{ name: 'Static 1', src: url }, { name: 'Carousel', cards: [{ src: a }, { src: b }] }]} />
