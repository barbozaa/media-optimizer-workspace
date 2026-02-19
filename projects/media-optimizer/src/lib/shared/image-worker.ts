/**
 * Web Worker for parallel image compression
 * Handles CPU-intensive image processing in separate thread
 * @internal
 */

import imageCompression from 'browser-image-compression';

interface WorkerMessage {
  id: string;
  file: File;
  options: {
    maxSizeMB: number;
    maxWidthOrHeight: number;
    useWebWorker: boolean;
    fileType: string;
    initialQuality: number;
  };
}

interface WorkerResponse {
  id: string;
  success: boolean;
  file?: File;
  error?: string;
}

// Listen for messages from main thread
self.onmessage = async (event: MessageEvent<WorkerMessage>) => {
  const { id, file, options } = event.data;
  
  try {
    const compressedFile = await imageCompression(file, options);
    
    const response: WorkerResponse = {
      id,
      success: true,
      file: compressedFile
    };
    
    self.postMessage(response);
  } catch (error) {
    const response: WorkerResponse = {
      id,
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
    
    self.postMessage(response);
  }
};
