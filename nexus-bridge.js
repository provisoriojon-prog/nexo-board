window.NexusReady=import('./nexus-runtime.js').then(async library=>{window.NexusLibrary=library;await library.start();}).catch(error=>{window.NexusStartupError=error.message;});
