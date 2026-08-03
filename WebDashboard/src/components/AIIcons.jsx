// Exact brand icons provided in the project repository (deepseek_icon.png and ollama.png)

export const DeepSeekIcon = ({ size = 24, style = {}, className = "" }) => (
  <img 
    src="/deepseek.png" 
    alt="DeepSeek" 
    width={size} 
    height={size} 
    style={{ display: 'inline-block', verticalAlign: 'middle', objectFit: 'contain', ...style }}
    className={className}
  />
);

export const OllamaIcon = ({ size = 24, style = {}, className = "" }) => (
  <img 
    src="/ollama.png" 
    alt="Ollama" 
    width={size} 
    height={size} 
    style={{ 
      display: 'inline-block', 
      verticalAlign: 'middle', 
      objectFit: 'contain', 
      borderRadius: '4px',
      filter: 'brightness(0) invert(1)',
      ...style 
    }}
    className={className}
  />
);

export const OllamaPayIcon = ({ size = 24, style = {}, className = "" }) => (
  <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: size, height: size, ...style }}>
    <img 
      src="/ollama.png" 
      alt="Ollama Pay" 
      width={size} 
      height={size} 
      style={{ 
        objectFit: 'contain', 
        borderRadius: '4px',
        filter: 'brightness(0) invert(1)'
      }}
      className={className}
    />
    <div style={{
      position: 'absolute',
      bottom: '-2px',
      right: '-2px',
      background: '#f59e0b',
      color: '#000',
      borderRadius: '50%',
      width: `${Math.max(10, size * 0.45)}px`,
      height: `${Math.max(10, size * 0.45)}px`,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: `${Math.max(7, size * 0.35)}px`,
      fontWeight: 'bold',
      boxShadow: '0 0 4px rgba(0,0,0,0.5)'
    }}>
      $
    </div>
  </div>
);
