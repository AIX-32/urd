        class MediaLibrary {
            constructor() {
                this.allMedia = [];
                this.groupedMedia = [];
                this.mediaElements = new Map();
                this.videoObservers = new Map();
                this.carouselStates = new Map();
                this.container = document.getElementById('mediaGrid');
                this.isMobile = window.innerWidth <= 768;
                this.isProcessing = false;
                this.isAutoScrolling = false;
                this.autoScrollInterval = null;
                this.autoScrollIntervalTime = 3000;
                this.imageUrls = new Set();
                
                this.virtualContainer = document.createElement('div');
                this.virtualContainer.id = 'virtualMediaGrid';
                this.virtualContainer.style.position = 'relative';
                this.container.appendChild(this.virtualContainer);
                
                this.visibleStart = 0;
                this.visibleEnd = 0;
                this.itemHeight = 300;
                this.bufferSize = 10;
                
                this.setupEventListeners();
                this.updateFileCounter();
                
                window.addEventListener('resize', () => {
                    this.isMobile = window.innerWidth <= 768;
                    this.calculateItemHeight();
                    this.updateVisibleItems();
                    
                    this.handleOrientationChange();
                });
                
                window.addEventListener('orientationchange', () => {
                    setTimeout(() => {
                        this.handleOrientationChange();
                    }, 100);
                });
                
                this.showEmptyState();
                this.hideLoading();
            }
            
            calculateItemHeight() {
                const sampleCard = this.container.querySelector('.media-card');
                if (sampleCard) {
                    this.itemHeight = sampleCard.offsetHeight || 300;
                }
            }
            
            handleOrientationChange() {
                this.closeAllOverlays();
                
                this.calculateItemHeight();
                this.updateVisibleItems();
                
                this.updateCarouselsForOrientation();
                
                console.log('Orientation changed to:', window.orientation || 'unknown');
            }
            
            closeAllOverlays() {
                const videoOverlays = document.querySelectorAll('.video-overlay');
                videoOverlays.forEach(overlay => {
                    const video = overlay.querySelector('video');
                    if (video) {
                        video.pause();
                        const originalParent = overlay.parentElement;
                        if (originalParent) {
                            overlay.removeChild(video);
                            originalParent.appendChild(video);
                        }
                        overlay.remove();
                    }
                });
                
                const imageFullscreen = document.getElementById('imageFullscreenContainer');
                if (imageFullscreen) {
                    imageFullscreen.remove();
                }
                
                if (document.fullscreenElement) {
                    if (document.exitFullscreen) {
                        document.exitFullscreen();
                    }
                }
            }
            
            updateCarouselsForOrientation() {
                this.carouselStates.forEach((state, carouselId) => {
                    const container = document.getElementById(`carousel-${carouselId}`);
                    if (container) {
                        const slidesContainer = container.querySelector('.carousel-slides');
                        if (slidesContainer) {
                            const slideWidth = container.clientWidth;
                            slidesContainer.style.transform = `translateX(${-state.currentSlide * slideWidth}px)`;
                        }
                    }
                });
            }
            
            updateVisibleItems() {
                if (this.groupedMedia.length === 0) return;
                
                const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
                const viewportHeight = window.innerHeight;
                
                const startIndex = Math.max(0, Math.floor((scrollTop - this.bufferSize * this.itemHeight) / this.itemHeight));
                const endIndex = Math.min(
                    this.groupedMedia.length, 
                    Math.ceil((scrollTop + viewportHeight + this.bufferSize * this.itemHeight) / this.itemHeight)
                );
                
                const newStart = Math.max(0, startIndex);
                const newEnd = Math.min(this.groupedMedia.length, endIndex);
                
                if (newStart !== this.visibleStart || newEnd !== this.visibleEnd) {
                    this.visibleStart = newStart;
                    this.visibleEnd = newEnd;
                    this.renderVisibleItems();
                }
            }
            
            renderVisibleItems() {
                this.virtualContainer.innerHTML = '';
                
                for (let i = this.visibleStart; i < this.visibleEnd; i++) {
                    if (i < this.groupedMedia.length) {
                        const mediaGroup = this.groupedMedia[i];
                        const card = this.createMediaCard(mediaGroup, i);
                        
                        card.style.position = 'absolute';
                        card.style.top = `${i * this.itemHeight}px`;
                        card.style.width = '100%';
                        card.style.zIndex = '1';
                        
                        this.virtualContainer.appendChild(card);
                    }
                }
            }
            
            setupEventListeners() {
                const fileInput = document.getElementById('fileInput');
                const folderInput = document.getElementById('folderInput');
                const zipInput = document.getElementById('zipInput');
                const dropZone = document.getElementById('dropZone');
                
                fileInput.addEventListener('change', (e) => {
                    this.handleFiles(e.target.files);
                    e.target.value = '';
                });
                
                folderInput.addEventListener('change', (e) => {
                    this.handleFiles(e.target.files);
                    e.target.value = '';
                });
                
                zipInput.addEventListener('change', async (e) => {
                    if (e.target.files.length > 0) {
                        await this.handleZipFile(e.target.files[0]);
                        e.target.value = '';
                    }
                });
                
                dropZone.addEventListener('dragover', (e) => {
                    e.preventDefault();
                    dropZone.classList.add('dragover');
                });
                
                dropZone.addEventListener('dragleave', () => {
                    dropZone.classList.remove('dragover');
                });
                
                dropZone.addEventListener('drop', (e) => {
                    e.preventDefault();
                    dropZone.classList.remove('dragover');
                    if (e.dataTransfer.files.length) {
                        this.handleFiles(e.dataTransfer.files);
                    }
                });
                
                dropZone.addEventListener('click', (e) => {
                    if (e.target === dropZone || e.target.className === 'upload-section') {
                        fileInput.click();
                    }
                });
                
                const autoScrollToggle = document.getElementById('autoScrollToggle');
                if (autoScrollToggle) {
                    autoScrollToggle.addEventListener('click', () => {
                        mediaLibrary.toggleAutoScroll();
                    });
                }
                
                const shuffleBtn = document.getElementById('shuffleBtn');
                if (shuffleBtn) {
                    shuffleBtn.addEventListener('click', () => {
                        mediaLibrary.shuffleMedia();
                    });
                }
                
                const installPWA = document.getElementById('installPWA');
                if (installPWA) {
                    installPWA.addEventListener('click', () => {
                        installPWAHandler();
                    });
                }
                
                let scrollTimeout;
                window.addEventListener('scroll', () => {
                    clearTimeout(scrollTimeout);
                    scrollTimeout = setTimeout(() => {
                        this.updateVisibleItems();
                    }, 16);
                });
            }

            showLoading(message = 'Indexing files...') {
                const overlay = document.getElementById('loadingOverlay');
                const messageEl = document.getElementById('loadingMessage');
                const detailsEl = document.getElementById('loadingDetails');
                const progressEl = document.getElementById('progressFill');
                
                messageEl.textContent = message;
                detailsEl.textContent = '0 files processed';
                progressEl.style.width = '0%';
                overlay.style.visibility = 'visible';
                overlay.classList.remove('hidden');
            }

            updateLoading(processed, total, message = 'Indexing files...') {
                const detailsEl = document.getElementById('loadingDetails');
                const progressEl = document.getElementById('progressFill');
                const messageEl = document.getElementById('loadingMessage');
                
                messageEl.textContent = message;
                detailsEl.textContent = `${processed} of ${total} files processed`;
                const percent = Math.min(100, Math.round((processed / total) * 100));
                progressEl.style.width = `${percent}%`;
            }

            hideLoading() {
                const overlay = document.getElementById('loadingOverlay');
                overlay.classList.add('hidden');
                setTimeout(() => {
                    if (overlay.classList.contains('hidden')) {
                        overlay.style.visibility = 'hidden';
                    }
                }, 300);
            }

            handleFiles(files) {
                if (!files || files.length === 0) return;
                
                if (this.allMedia.length + files.length > 2000) {
                    alert(`Cannot upload ${files.length} files. Maximum limit is 2000 files. Current: ${this.allMedia.length}`);
                    return;
                }
                
                this.addMediaFiles(files);
            }
            
            async handleZipFile(zipFile) {
                if (typeof JSZip === 'undefined') {
                    await this.loadJSZip();
                }
                
                if (!JSZip) {
                    alert('JSZip library is required to extract zip files. Please include it in your project.');
                    return;
                }
                
                try {
                    this.showLoading('Extracting zip file...');
                    
                    const zip = new JSZip();
                    const zipContent = await zip.loadAsync(zipFile);
                    
                    const extractedFiles = [];
                    
                    for (const [filename, zipEntry] of Object.entries(zipContent.files)) {
                        if (!zipEntry.dir) {
                            try {
                                const fileBlob = await zipEntry.async('blob');
                                const file = new File([fileBlob], filename, { type: this.getMimeType(filename) });
                                extractedFiles.push(file);
                            } catch (error) {
                                console.error('Error extracting file:', filename, error);
                            }
                        }
                    }
                    
                    if (extractedFiles.length > 0) {
                        this.handleFiles(extractedFiles);
                    } else {
                        alert('No media files found in the zip archive.');
                    }
                } catch (error) {
                    console.error('Error processing zip file:', error);
                    alert('Error processing zip file: ' + error.message);
                } finally {
                    this.hideLoading();
                }
            }
            
            getMimeType(filename) {
                const ext = filename.split('.').pop().toLowerCase();
                const mimeTypes = {
                    'jpg': 'image/jpeg',
                    'jpeg': 'image/jpeg',
                    'png': 'image/png',
                    'gif': 'image/gif',
                    'bmp': 'image/bmp',
                    'webp': 'image/webp',
                    'svg': 'image/svg+xml',
                    'mp4': 'video/mp4',
                    'avi': 'video/x-msvideo',
                    'mov': 'video/quicktime',
                    'wmv': 'video/x-ms-wmv',
                    'flv': 'video/x-flv',
                    'webm': 'video/webm',
                    'mkv': 'video/x-matroska',
                    'm4v': 'video/x-m4v',
                    '3gp': 'video/3gpp'
                };
                return mimeTypes[ext] || 'application/octet-stream';
            }
            
            async loadJSZip() {
                return new Promise((resolve, reject) => {
                    if (typeof JSZip !== 'undefined') {
                        resolve();
                        return;
                    }
                    
                    const script = document.createElement('script');
                    script.src = 'https://unpkg.com/jszip@3.10.1/dist/jszip.min.js';
                    script.onload = resolve;
                    script.onerror = reject;
                    document.head.appendChild(script);
                });
            }

            extractGroupInfo(filename) {
                const pattern1 = /^([a-zA-Z0-9]+)-(\d{2,})-(.+)\.[a-zA-Z0-9]+$/;
                const pattern2 = /^(.+?)-(\d{2,})\.[a-zA-Z0-9]+$/;
                const pattern3 = /^(.+?)_(\d{2,})\.[a-zA-Z0-9]+$/;
                const pattern4 = /^(\d{2,})[-_\s]+(.+)\.[a-zA-Z0-9]+$/;
                const pattern5 = /^(.+?)\s+(\d{2,})\.[a-zA-Z0-9]+$/;
                
                let match;
                if (match = filename.match(pattern1)) return { baseName: match[1], groupNum: parseInt(match[2]), isGrouped: true };
                else if (match = filename.match(pattern2)) return { baseName: match[1].replace(/[-_]/g, ' ').trim(), groupNum: parseInt(match[2]), isGrouped: true };
                else if (match = filename.match(pattern3)) return { baseName: match[1].replace(/[-_]/g, ' ').trim(), groupNum: parseInt(match[2]), isGrouped: true };
                else if (match = filename.match(pattern4)) return { baseName: match[2].replace(/[-_]/g, ' ').trim(), groupNum: parseInt(match[1]), isGrouped: true };
                else if (match = filename.match(pattern5)) return { baseName: match[1].trim(), groupNum: parseInt(match[2]), isGrouped: true };
                
                let cleanName = filename.replace(/\.[^/.]+$/, "").replace(/[-_\s]+/g, ' ').trim();
                cleanName = cleanName.charAt(0).toUpperCase() + cleanName.slice(1);
                return { baseName: cleanName, groupNum: 0, isGrouped: false };
            }

            async processFilesInBatches(files, batchSize = 10) {
                this.showLoading('Processing files...');
                const totalFiles = files.length;
                let processed = 0;
                const results = [];
                
                for (let i = 0; i < files.length; i += batchSize) {
                    const batch = files.slice(i, i + batchSize);
                    const batchResults = batch.map((file, batchIndex) => {
                        const info = this.extractGroupInfo(file.name);
                        return { file, ...info, originalIndex: i + batchIndex };
                    });
                    
                    results.push(...batchResults);
                    processed += batch.length;
                    this.updateLoading(processed, totalFiles, 'Processing files...');
                    await new Promise(resolve => setTimeout(resolve, 10));
                }
                return results;
            }

            async groupMediaFiles(files) {
                const processedFiles = await this.processFilesInBatches(files);
                const groups = new Map();
                const singles = [];
                
                for (const item of processedFiles) {
                    if (item.isGrouped && item.groupNum > 0) {
                        const key = item.baseName.toLowerCase();
                        if (!groups.has(key)) groups.set(key, { baseName: item.baseName, items: [] });
                        groups.get(key).items.push(item);
                    } else {
                        singles.push(item);
                    }
                }
                
                const result = [];
                groups.forEach(group => {
                    group.items.sort((a, b) => a.groupNum - b.groupNum);
                    let isConsecutive = true;
                    for (let i = 1; i < group.items.length; i++) {
                        if (group.items[i].groupNum !== group.items[i-1].groupNum + 1) {
                            isConsecutive = false;
                            break;
                        }
                    }
                    if (group.items.length > 1 && isConsecutive) {
                        result.push({
                            type: 'carousel',
                            files: group.items.map(item => item.file),
                            title: group.baseName,
                            originalIndex: Math.min(...group.items.map(item => item.originalIndex))
                        });
                    } else {
                        group.items.forEach(item => singles.push({ ...item, title: `${item.baseName} ${item.groupNum}` }));
                    }
                });
                
                singles.sort((a, b) => a.originalIndex - b.originalIndex).forEach(item => {
                    result.push({
                        type: 'single',
                        files: [item.file],
                        title: item.title || item.baseName,
                        originalIndex: item.originalIndex
                    });
                });
                
                return result.sort((a, b) => a.originalIndex - b.originalIndex);
            }

            createMediaElement(file, lazyLoad = true) {
                const MAX_SIZE = 100 * 1024 * 1024;
                if (file.size > MAX_SIZE) {
                    console.error('File too large:', file.name, file.size);
                    return null;
                }
                
                if (file.type.startsWith('image/')) {
                    const img = new Image();
                    img.loading = 'lazy';
                    
                    if (lazyLoad) {
                        img.style.backgroundColor = '#333';
                        img.style.display = 'block';
                        img.style.width = '100%';
                        img.style.height = 'auto';
                        img.alt = file.name;
                        
                        this.setupImageLazyLoading(img, file);
                    } else {
                        const url = URL.createObjectURL(file);
                        img.src = url;
                        img.alt = file.name;
                        
                        img.dataset.originalUrl = url;
                        this.imageUrls.add(url);
                        
                        img.onload = () => {
                        };
                        
                        img.onerror = () => {
                            console.error('Failed image:', file.name);
                            this.imageUrls.delete(url);
                            URL.revokeObjectURL(url);
                            if (img.parentNode) {
                                img.outerHTML = '<span style="color:red; font-size:0.8rem">Failed to load</span>';
                            }
                        };
                    }
                    
                    img.addEventListener('click', (e) => {
                        e.stopPropagation();
                        this.enterImageFullscreen(img);
                    });
                    
                    return { element: img, type: 'image' };
                } else if (file.type.startsWith('video/')) {
                    const video = document.createElement('video');
                    video.playsInline = true;
                    video.muted = true;
                    video.loop = true;
                    video.preload = 'metadata';
                    
                    if (lazyLoad) {
                        video.style.backgroundColor = '#000';
                        video.style.display = 'block';
                        video.style.width = '100%';
                        video.style.height = 'auto';
                        
                        this.setupVideoLazyLoading(video, file);
                    } else {
                        const url = URL.createObjectURL(file);
                        video.src = url;
                        
                        video.onloadedmetadata = () => {
                            URL.revokeObjectURL(url);
                        };
                        
                        video.onerror = () => {
                            console.error('Failed video:', file.name);
                            URL.revokeObjectURL(url);
                            if (video.parentNode) {
                                video.outerHTML = '<span style="color:red; font-size:0.8rem">Failed to load</span>';
                            }
                        };
                        
                        video.addEventListener('click', (e) => {
                            e.stopPropagation();
                            this.playVideoInPlace(video);
                        });
                        
                        const observer = new IntersectionObserver((entries) => {
                            entries.forEach(entry => {
                                if (entry.isIntersecting) {
                                    if (!video.parentElement || !video.parentElement.classList.contains('video-overlay')) {
                                        video.muted = true;
                                        setTimeout(() => {
                                            const playPromise = video.play();
                                            if (playPromise !== undefined) {
                                                playPromise.catch(error => {
                                                    console.log('Autoplay prevented:', error);
                                                });
                                            }
                                        }, 150);
                                    }
                                } else {
                                    if (!video.parentElement || !video.parentElement.classList.contains('video-overlay')) {
                                        video.pause();
                                    }
                                }
                            });
                        }, { 
                            threshold: 0.6,
                            rootMargin: '50px'
                        });
                        this.videoObservers.set(video, observer);
                        observer.observe(video);
                    }
                    
                    return { element: video, type: 'video' };
                }
                
                return null;
            }
            
            setupImageLazyLoading(img, file) {
                const observer = new IntersectionObserver((entries) => {
                    entries.forEach(entry => {
                        if (entry.isIntersecting) {
                            observer.unobserve(entry.target);
                            
                            const url = URL.createObjectURL(file);
                            entry.target.src = url;
                            entry.target.dataset.originalUrl = url;
                            
                            this.imageUrls.add(url);
                            
                            entry.target.onload = () => {
                            };
                            
                            entry.target.onerror = () => {
                                console.error('Failed image:', file.name);
                                this.imageUrls.delete(url);
                                URL.revokeObjectURL(url);
                                if (entry.target.parentNode) {
                                    entry.target.outerHTML = '<span style="color:red; font-size:0.8rem">Failed to load</span>';
                                }
                            };
                        }
                    });
                }, { threshold: 0.1 });
                
                observer.observe(img);
            }
            
            setupVideoLazyLoading(video, file) {
                const placeholder = document.createElement('div');
                placeholder.style.position = 'relative';
                placeholder.style.width = '100%';
                placeholder.style.height = '100%';
                placeholder.style.backgroundColor = '#000';
                placeholder.style.display = 'flex';
                placeholder.style.alignItems = 'center';
                placeholder.style.justifyContent = 'center';
                
                const playIcon = document.createElement('div');
                playIcon.innerHTML = '▶';
                playIcon.style.fontSize = '60px';
                playIcon.style.color = 'rgba(255, 255, 255, 0.8)';
                playIcon.style.textAlign = 'center';
                playIcon.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
                playIcon.style.borderRadius = '50%';
                playIcon.style.width = '80px';
                playIcon.style.height = '80px';
                playIcon.style.display = 'flex';
                playIcon.style.alignItems = 'center';
                playIcon.style.justifyContent = 'center';
                
                placeholder.appendChild(playIcon);
                video.appendChild(placeholder);
                
                const observer = new IntersectionObserver((entries) => {
                    entries.forEach(entry => {
                        if (entry.isIntersecting) {
                            observer.unobserve(entry.target);
                            
                            entry.target.innerHTML = '';
                            
                            const url = URL.createObjectURL(file);
                            entry.target.src = url;
                            
                            entry.target.onloadedmetadata = () => {
                                URL.revokeObjectURL(url);
                            };
                            
                            entry.target.onerror = () => {
                                console.error('Failed video:', file.name);
                                URL.revokeObjectURL(url);
                                if (entry.target.parentNode) {
                                    entry.target.outerHTML = '<span style="color:red; font-size:0.8rem">Failed to load</span>';
                                }
                            };
                            
                            entry.target.addEventListener('click', (e) => {
                                e.stopPropagation();
                                this.playVideoInPlace(entry.target);
                            });
                            
                            const autoObserver = new IntersectionObserver((entries) => {
                                entries.forEach(vEntry => {
                                    if (vEntry.isIntersecting) {
                                        if (!vEntry.target.parentElement || !vEntry.target.parentElement.classList.contains('video-overlay')) {
                                            vEntry.target.muted = true;
                                            setTimeout(() => {
                                                const playPromise = vEntry.target.play();
                                                if (playPromise !== undefined) {
                                                    playPromise.catch(error => {
                                                        console.log('Autoplay prevented:', error);
                                                    });
                                                }
                                            }, 150);
                                        }
                                    } else {
                                        if (!vEntry.target.parentElement || !vEntry.target.parentElement.classList.contains('video-overlay')) {
                                            vEntry.target.pause();
                                        }
                                    }
                                });
                            }, { 
                                threshold: 0.6,
                                rootMargin: '50px'
                            });
                            this.videoObservers.set(entry.target, autoObserver);
                            autoObserver.observe(entry.target);
                        }
                    });
                }, { threshold: 0.1 });
                
                observer.observe(video);
            }

            createCarousel(group, cardId) {
                const container = document.createElement('div');
                container.className = 'carousel-container';
                container.id = `carousel-${cardId}`;
                
                const slidesContainer = document.createElement('div');
                slidesContainer.className = 'carousel-slides';
                
                this.carouselStates.set(cardId, {
                    currentSlide: 0,
                    totalSlides: group.files.length,
                    slides: []
                });
                
                const state = this.carouselStates.get(cardId);
                
                for (let i = 0; i < group.files.length; i++) {
                    const slide = document.createElement('div');
                    slide.className = 'carousel-slide';
                    slide.dataset.index = i;
                    
                    const media = this.createMediaElement(group.files[i], true);
                    if (media) {
                        slide.appendChild(media.element);
                    } else {
                        const errorDiv = document.createElement('div');
                        errorDiv.style.display = 'flex';
                        errorDiv.style.alignItems = 'center';
                        errorDiv.style.justifyContent = 'center';
                        errorDiv.style.height = '100%';
                        errorDiv.style.color = 'var(--text-secondary)';
                        errorDiv.innerHTML = 'Error loading media';
                        slide.appendChild(errorDiv);
                    }
                    
                    slidesContainer.appendChild(slide);
                    state.slides.push(slide);
                }
                
                container.appendChild(slidesContainer);
                
                const swipeIndicator = document.createElement('div');
                swipeIndicator.className = 'swipe-indicator';
                swipeIndicator.innerHTML = `
                    <span>Swipe</span>
                    <div class="swipe-indicator-icon">
                        <span></span>
                        <span></span>
                        <span></span>
                    </div>
                `;
                container.appendChild(swipeIndicator);
                
                if (group.files.length > 1) {
                    if (!this.isMobile) {
                        const prevBtn = document.createElement('button');
                        prevBtn.className = 'carousel-nav prev';
                        prevBtn.innerHTML = '‹';
                        prevBtn.onclick = (e) => { e.stopPropagation(); this.navigateCarousel(cardId, -1); };
                        
                        const nextBtn = document.createElement('button');
                        nextBtn.className = 'carousel-nav next';
                        nextBtn.innerHTML = '›';
                        nextBtn.onclick = (e) => { e.stopPropagation(); this.navigateCarousel(cardId, 1); };
                        
                        container.appendChild(prevBtn);
                        container.appendChild(nextBtn);
                        
                        const dotsContainer = document.createElement('div');
                        dotsContainer.className = 'carousel-dots';
                        for (let i = 0; i < group.files.length; i++) {
                            const dot = document.createElement('button');
                            dot.className = `carousel-dot ${i === 0 ? 'active' : ''}`;
                            dot.onclick = (e) => { e.stopPropagation(); this.goToSlide(cardId, i); };
                            dotsContainer.appendChild(dot);
                        }
                        container.appendChild(dotsContainer);
                    }
                    if (this.isMobile) {
                        this.setupCarouselTouchEvents(container, cardId);
                    }
                }
                
                group.files.forEach((file, index) => {
                    const media = this.createMediaElement(file, true);
                    const slide = state.slides[index];
                    if (media && slide) {
                        slide.innerHTML = '';
                        slide.appendChild(media.element);
                    } else if (slide) {
                        slide.innerHTML = '<span style="color:red; font-size:0.8rem">Error</span>';
                    }
                });
                
                return container;
            }

            setupCarouselTouchEvents(container, carouselId) {
                const state = this.carouselStates.get(carouselId);
                const slidesContainer = container.querySelector('.carousel-slides');
                let startX = 0;
                let currentX = 0;
                let isDragging = false;
                
                const onTouchStart = (e) => {
                    isDragging = true;
                    startX = e.touches ? e.touches[0].clientX : e.clientX;
                    currentX = startX;
                    slidesContainer.style.transition = 'none';
                };
                
                const onTouchMove = (e) => {
                    if (!isDragging) return;
                    currentX = e.touches ? e.touches[0].clientX : e.clientX;
                    const xDiff = Math.abs(currentX - startX);
                    if (xDiff < 10) return;
                    e.preventDefault();
                    
                    const diff = currentX - startX;
                    const slideWidth = container.clientWidth;
                    const basePosition = -state.currentSlide * slideWidth;
                    slidesContainer.style.transform = `translateX(${basePosition + diff}px)`;
                };
                
                const onTouchEnd = () => {
                    if (!isDragging) return;
                    isDragging = false;
                    const slideWidth = container.clientWidth;
                    const diff = currentX - startX;
                    slidesContainer.style.transition = 'transform 0.3s ease';
                    
                    if (Math.abs(diff) > slideWidth * 0.25) {
                        this.navigateCarousel(carouselId, diff > 0 ? -1 : 1);
                    } else {
                        this.goToSlide(carouselId, state.currentSlide);
                    }
                };
                
                container.addEventListener('touchstart', onTouchStart, { passive: false });
                container.addEventListener('touchmove', onTouchMove, { passive: false });
                container.addEventListener('touchend', onTouchEnd);
            }

            navigateCarousel(carouselId, direction) {
                const state = this.carouselStates.get(carouselId);
                let newSlide = state.currentSlide + direction;
                if (newSlide < 0) newSlide = state.totalSlides - 1;
                if (newSlide >= state.totalSlides) newSlide = 0;
                this.goToSlide(carouselId, newSlide);
            }

            goToSlide(carouselId, slideIndex) {
                const state = this.carouselStates.get(carouselId);
                state.currentSlide = slideIndex;
                const container = document.getElementById(`carousel-${carouselId}`);
                const slidesContainer = container.querySelector('.carousel-slides');
                const slideWidth = container.clientWidth;
                slidesContainer.style.transform = `translateX(${-slideIndex * slideWidth}px)`;
                
                const dots = container.querySelectorAll('.carousel-dot');
                dots.forEach((dot, index) => dot.classList.toggle('active', index === slideIndex));
            }

            createMediaCard(mediaGroup, index) {
                const card = document.createElement('div');
                card.className = 'media-card';
                card.dataset.index = index;
                card.style.animationDelay = `${index * 0.05}s`;
                
                const header = document.createElement('div');
                header.className = 'card-header';
                const title = document.createElement('div');
                title.className = 'card-title';
                title.textContent = mediaGroup.title;
                header.appendChild(title);
                
                const preview = document.createElement('div');
                preview.className = 'media-preview';
                
                if (mediaGroup.type === 'carousel') {
                    const carousel = this.createCarousel(mediaGroup, index);
                    preview.appendChild(carousel);
                } else {
                    const media = this.createMediaElement(mediaGroup.files[0], true);
                    if (media) {
                        preview.appendChild(media.element);
                    } else {
                        const errorDiv = document.createElement('div');
                        errorDiv.style.display = 'flex';
                        errorDiv.style.alignItems = 'center';
                        errorDiv.style.justifyContent = 'center';
                        errorDiv.style.height = '150px';
                        errorDiv.style.color = 'var(--text-secondary)';
                        errorDiv.innerHTML = 'Error loading media';
                        preview.appendChild(errorDiv);
                    }
                }
                
                card.appendChild(header);
                card.appendChild(preview);
                return card;
            }

            async addMediaFiles(files) {
                if (this.isProcessing) return;
                this.isProcessing = true;
                const fileArray = Array.from(files);
                
                try {
                    this.showLoading('Adding files...');
                    fileArray.forEach(file => this.allMedia.push(file));
                    
                    this.container.innerHTML = '<div class="empty-state"><h3>Processing files...</h3><p>Please wait while we organize your media</p></div>';
                    
                    this.updateLoading(0, fileArray.length, 'Organizing files...');
                    this.groupedMedia = await this.groupMediaFiles(this.allMedia);
                    
                    this.virtualContainer.style.height = `${this.groupedMedia.length * this.itemHeight}px`;
                    
                    this.visibleStart = 0;
                    this.visibleEnd = Math.min(this.groupedMedia.length, 20);
                    
                    this.container.innerHTML = '';
                    this.container.appendChild(this.virtualContainer);
                    
                    this.renderVisibleItems();
                    
                    this.updateLoading(this.groupedMedia.length, this.groupedMedia.length, 'Creating cards...');
                    
                    this.updateStats();
                    
                    this.autoShuffleNewMedia();
                } catch (error) {
                    console.error('Error processing files:', error);
                    this.showEmptyState();
                } finally {
                    this.isProcessing = false;
                    this.hideLoading();
                }
            }

            updateStats() {
                document.getElementById('totalFiles').textContent = this.allMedia.length;
                document.getElementById('visibleFiles').textContent = this.groupedMedia.length;
                let totalSize = 0;
                this.allMedia.forEach(file => { totalSize += file.size; });
                const memoryMB = (totalSize / (1024 * 1024)).toFixed(1);
                document.getElementById('memoryUsage').textContent = `${memoryMB} MB`;
                this.updateFileCounter();
            }

            updateFileCounter() {
                const count = this.allMedia.length;
                document.getElementById('fileCounter').textContent = count;
                document.getElementById('mobileFileCounter').textContent = count;
                const display = count > 0 ? 'inline-block' : 'none';
                document.getElementById('fileCounter').style.display = display;
                document.getElementById('mobileFileCounter').style.display = display;
            }

            cleanupObservers() {
                this.videoObservers.forEach((observer, video) => {
                    observer.disconnect();
                    video.pause();
                    video.src = '';
                    video.load();
                });
                this.videoObservers.clear();
                
                this.imageUrls.forEach(url => {
                    try {
                        URL.revokeObjectURL(url);
                    } catch (e) {
                    }
                });
                this.imageUrls.clear();
                
                this.mediaElements.clear();
            }
            
            cleanupImageURLs() {
                this.imageUrls.forEach(url => {
                    try {
                        URL.revokeObjectURL(url);
                    } catch (e) {
                    }
                });
                this.imageUrls.clear();
            }
            
            clearAll() {
                if (this.allMedia.length === 0) return;
                if (!confirm(`Clear all ${this.allMedia.length} files?`)) return;
                
                this.showLoading('Clearing files...');
                setTimeout(() => {
                    this.cleanupObservers();
                    this.cleanupImageURLs();
                    this.mediaElements.clear();
                    this.carouselStates.clear();
                    this.allMedia = [];
                    this.groupedMedia = [];
                    this.visibleStart = 0;
                    this.visibleEnd = 0;
                    this.container.innerHTML = '';
                    this.updateStats();
                    this.showEmptyState();
                    this.hideLoading();
                }, 100);
            }

            showEmptyState() {
                this.container.innerHTML = `
                    <div class="empty-state">
                        <svg viewBox="0 0 24 24" fill="currentColor"><path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/></svg>
                        <h3>No media uploaded yet</h3>
                        <p>Upload images, videos, or GIFs to get started</p>
                    </div>`;
            }
            
            playVideoInPlace(video) {
                if (video.parentElement && video.parentElement.classList.contains('video-overlay')) {
                    if (video.paused) {
                        video.play().catch(e => console.log('Play prevented:', e));
                    } else {
                        video.pause();
                    }
                    return;
                }
                
                const originalWidth = video.offsetWidth;
                const originalHeight = video.offsetHeight;
                
                const previewContainer = video.parentElement;
                const originalParent = video.parentElement;
                
                const overlay = document.createElement('div');
                overlay.className = 'video-overlay';
                
                const controls = document.createElement('div');
                controls.className = 'video-controls';
                
                const timeline = document.createElement('div');
                timeline.className = 'video-timeline';
                
                const progress = document.createElement('div');
                progress.className = 'video-progress';
                timeline.appendChild(progress);
                
                const controlsBottom = document.createElement('div');
                controlsBottom.className = 'video-controls-bottom';
                
                const timeDisplay = document.createElement('div');
                timeDisplay.className = 'video-time';
                timeDisplay.textContent = `0:00 / ${this.formatTime(video.duration)}`;
                
                const fullscreenBtn = document.createElement('button');
                fullscreenBtn.className = 'video-fullscreen-btn';
                fullscreenBtn.innerHTML = '⛶';
                fullscreenBtn.title = 'Fullscreen';
                
                controlsBottom.appendChild(timeDisplay);
                controlsBottom.appendChild(fullscreenBtn);
                
                controls.appendChild(timeline);
                controls.appendChild(controlsBottom);
                
                const closeBtn = document.createElement('button');
                closeBtn.className = 'video-close-btn';
                closeBtn.innerHTML = '✕';
                closeBtn.title = 'Close';
                
                overlay.appendChild(closeBtn);
                overlay.appendChild(video);
                overlay.appendChild(controls);
                
                originalParent.appendChild(overlay);
                
                closeBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.exitVideoOverlay(video, originalParent);
                });
                
                video.addEventListener('timeupdate', () => {
                    const percent = (video.currentTime / video.duration) * 100;
                    progress.style.width = `${percent}%`;
                    timeDisplay.textContent = `${this.formatTime(video.currentTime)} / ${this.formatTime(video.duration)}`;
                });
                
                timeline.addEventListener('click', (e) => {
                    const rect = timeline.getBoundingClientRect();
                    const pos = (e.clientX - rect.left) / rect.width;
                    video.currentTime = pos * video.duration;
                });
                
                fullscreenBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.enterVideoFullscreen(video);
                });
                
                video.play().catch(e => console.log('Play prevented:', e));
            }
            
            formatTime(seconds) {
                if (isNaN(seconds)) return '0:00';
                
                const mins = Math.floor(seconds / 60);
                const secs = Math.floor(seconds % 60);
                return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
            }
            
            enterVideoFullscreen(video) {
                if (document.fullscreenElement || document.mozFullScreenElement || 
                    document.webkitFullscreenElement || document.msFullscreenElement) {
                    video.focus();
                    return;
                }
                
                if (video.requestFullscreen) {
                    video.requestFullscreen();
                } else if (video.webkitRequestFullscreen) {
                    video.webkitRequestFullscreen();
                } else if (video.mozRequestFullScreen) {
                    video.mozRequestFullScreen();
                } else if (video.msRequestFullscreen) {
                    video.msRequestFullscreen();
                }
            }
            

            
            enterImageFullscreen(img) {
                if (document.fullscreenElement || document.mozFullScreenElement || 
                    document.webkitFullscreenElement || document.msFullscreenElement) {
                    if (document.exitFullscreen) {
                        document.exitFullscreen();
                    } else if (document.webkitExitFullscreen) {
                        document.webkitExitFullscreen();
                    } else if (document.mozCancelFullScreen) {
                        document.mozCancelFullScreen();
                    } else if (document.msExitFullscreen) {
                        document.msExitFullscreen();
                    }
                    return;
                }
                
                const tempContainer = document.createElement('div');
                tempContainer.id = 'imageFullscreenContainer';
                tempContainer.style.position = 'fixed';
                tempContainer.style.top = '0';
                tempContainer.style.left = '0';
                tempContainer.style.width = '100vw';
                tempContainer.style.height = '100vh';
                tempContainer.style.backgroundColor = 'black';
                tempContainer.style.display = 'flex';
                tempContainer.style.justifyContent = 'center';
                tempContainer.style.alignItems = 'center';
                tempContainer.style.zIndex = '9999';
                tempContainer.style.cursor = 'zoom-out';
                
                const fullscreenImg = new Image();
                fullscreenImg.src = img.dataset.originalUrl || img.src;
                fullscreenImg.style.maxWidth = '100%';
                fullscreenImg.style.maxHeight = '100%';
                fullscreenImg.style.objectFit = 'contain';
                fullscreenImg.style.cursor = 'zoom-out';
                
                tempContainer.appendChild(fullscreenImg);
                document.body.appendChild(tempContainer);
                
                const exitFullscreen = () => {
                    if (document.fullscreenElement) {
                        if (document.exitFullscreen) {
                            document.exitFullscreen();
                        } else if (document.webkitExitFullscreen) {
                            document.webkitExitFullscreen();
                        } else if (document.mozCancelFullScreen) {
                            document.mozCancelFullScreen();
                        } else if (document.msExitFullscreen) {
                            document.msExitFullscreen();
                        }
                    }
                    if (document.body.contains(tempContainer)) {
                        document.body.removeChild(tempContainer);
                    }
                };
                
                tempContainer.addEventListener('click', exitFullscreen);
                
                const handleKeyDown = (e) => {
                    if (e.key === 'Escape') {
                        exitFullscreen();
                        document.removeEventListener('keydown', handleKeyDown);
                    }
                };
                document.addEventListener('keydown', handleKeyDown);
                
                if (tempContainer.requestFullscreen) {
                    tempContainer.requestFullscreen().catch(() => {
                        console.log('Fullscreen failed, using fallback');
                    });
                } else if (tempContainer.webkitRequestFullscreen) {
                    tempContainer.webkitRequestFullscreen();
                } else if (tempContainer.mozRequestFullScreen) {
                    tempContainer.mozRequestFullScreen();
                } else if (tempContainer.msRequestFullscreen) {
                    tempContainer.msRequestFullscreen();
                }
            }
            
            toggleAutoScroll() {
                this.isAutoScrolling = !this.isAutoScrolling;
                
                const toggleBtn = document.getElementById('autoScrollToggle');
                if (this.isAutoScrolling) {
                    toggleBtn.innerHTML = `Auto Scroll: On`;
                    this.startAutoScroll();
                } else {
                    toggleBtn.innerHTML = `Auto Scroll: Off`;
                    this.stopAutoScroll();
                }
            }
            
            startAutoScroll() {
                if (this.autoScrollInterval) {
                    clearInterval(this.autoScrollInterval);
                }
                
                let lastTimestamp = 0;
                const scrollSpeed = 2;
                
                const smoothScroll = (timestamp) => {
                    if (timestamp - lastTimestamp > 16) {
                        const scrollPosition = window.scrollY;
                        const windowHeight = window.innerHeight;
                        const documentHeight = document.documentElement.scrollHeight;
                        
                        if (scrollPosition + windowHeight >= documentHeight - 50) {
                            window.scrollTo({ 
                                top: 0, 
                                behavior: 'smooth' 
                            });
                        } else {
                            window.scrollBy({ 
                                top: scrollSpeed, 
                                behavior: 'instant'
                            });
                        }
                        lastTimestamp = timestamp;
                    }
                    
                    if (this.isAutoScrolling) {
                        this.autoScrollInterval = requestAnimationFrame(smoothScroll);
                    }
                };
                
                this.autoScrollInterval = requestAnimationFrame(smoothScroll);
            }
            
            stopAutoScroll() {
                if (this.autoScrollInterval) {
                    if (typeof this.autoScrollInterval === 'number') {
                        clearInterval(this.autoScrollInterval);
                    } else {
                        cancelAnimationFrame(this.autoScrollInterval);
                    }
                    this.autoScrollInterval = null;
                }
            }
            
            shuffleMedia() {
                if (this.groupedMedia.length === 0) return;
                
                const carousels = this.groupedMedia.filter(item => item.type === 'carousel');
                const singles = this.groupedMedia.filter(item => item.type === 'single');
                
                this.shuffleArray(carousels);
                this.shuffleArray(singles);
                
                const allItems = [];
                
                const types = [];
                this.groupedMedia.forEach(item => {
                    types.push(item.type);
                });
                
                this.shuffleArray(types);
                
                let carouselIndex = 0;
                let singleIndex = 0;
                
                for (const type of types) {
                    if (type === 'carousel' && carouselIndex < carousels.length) {
                        allItems.push(carousels[carouselIndex]);
                        carouselIndex++;
                    } else if (type === 'single' && singleIndex < singles.length) {
                        allItems.push(singles[singleIndex]);
                        singleIndex++;
                    }
                }
                
                this.groupedMedia = allItems;
                
                this.renderMediaGrid();
            }
            
            autoShuffleNewMedia() {
                if (this.groupedMedia.length === 0) return;
                
                this.shuffleMedia();
                
                console.log('Auto-shuffled', this.groupedMedia.length, 'media items');
            }
            
            shuffleArray(array) {
                for (let i = array.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    [array[i], array[j]] = [array[j], array[i]];
                }
            }
            
            renderMediaGrid() {
                this.virtualContainer.style.height = `${this.groupedMedia.length * this.itemHeight}px`;
                
                this.visibleStart = 0;
                this.visibleEnd = Math.min(this.groupedMedia.length, 20);
                
                this.container.innerHTML = '';
                this.container.appendChild(this.virtualContainer);
                
                this.renderVisibleItems();
                
                this.updateStats();
            }
            
            exitVideoOverlay(video, originalParent) {
                const overlay = video.parentElement;
                if (overlay && overlay.classList.contains('video-overlay')) {
                    overlay.removeChild(video);
                    originalParent.appendChild(video);
                }
            }
            

        }

        const mediaLibrary = new MediaLibrary();
        const hamburgerMenu = document.getElementById('hamburgerMenu');
        const sidebar = document.getElementById('sidebar');
        const sidebarOverlay = document.getElementById('sidebarOverlay');
        const sidebarClose = document.getElementById('sidebarClose');

        function openSidebar() {
            sidebar.classList.add('active');
            sidebarOverlay.style.display = 'block';
            setTimeout(() => { sidebarOverlay.style.opacity = '1'; }, 10);
        }

        function closeSidebar() {
            sidebar.classList.remove('active');
            sidebarOverlay.style.opacity = '0';
            setTimeout(() => { sidebarOverlay.style.display = 'none'; }, 300);
        }

        hamburgerMenu.addEventListener('click', openSidebar);
        sidebarClose.addEventListener('click', closeSidebar);
        sidebarOverlay.addEventListener('click', closeSidebar);

        function toggleFullscreen() {
            closeSidebar();
            if (!document.fullscreenElement) {
                document.documentElement.requestFullscreen().catch(err => {
                    console.log(`Error attempting to enable fullscreen: ${err.message}`);
                });
            } else {
                if (document.exitFullscreen) document.exitFullscreen();
            }
        }

        document.addEventListener('fullscreenchange', () => {
            if (document.fullscreenElement) {
                document.body.classList.add('fullscreen');
            } else {
                document.body.classList.remove('fullscreen');
            }
        });

        window.addEventListener('beforeunload', () => {
            mediaLibrary.cleanupObservers();
            mediaLibrary.cleanupImageURLs();
            mediaLibrary.mediaElements.clear();
        });

        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                mediaLibrary.videoObservers.forEach((observer, video) => {
                    video.pause();
                });
            }
        });
        
        function scrollToTop() {
            window.scrollTo({
                top: 0,
                behavior: 'smooth'
            });
        }

        let deferredPrompt;
        
        window.addEventListener('beforeinstallprompt', (e) => {
            e.preventDefault();
            deferredPrompt = e;
        });
        
        function installPWAHandler() {
            if (deferredPrompt) {
                deferredPrompt.prompt();
                
                deferredPrompt.userChoice.then((choiceResult) => {
                    if (choiceResult.outcome === 'accepted') {
                        console.log('User accepted the install prompt');
                    } else {
                        console.log('User dismissed the install prompt');
                    }
                    deferredPrompt = null;
                });
            } else {
                if (window.matchMedia('(display-mode: standalone)').matches) {
                    alert('App is already installed!');
                } else {
                    alert('PWA installation is not supported in this browser or already installed.');
                }
            }
        }

        window.addEventListener('appinstalled', () => {
            console.log('PWA was installed');
        });
        
        if ('serviceWorker' in navigator) {
            window.addEventListener('load', () => {
                navigator.serviceWorker.register('./sw.js', { scope: '/urd/' })
                    .then((registration) => {
                        console.log('ServiceWorker registration successful with scope: ', registration.scope);
                    })
                    .catch((error) => {
                        console.log('ServiceWorker registration failed: ', error);
                    });
            });
        }
