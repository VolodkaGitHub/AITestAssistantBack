
/**
 * Mobile Optimization Utilities
 * Enhances mobile user experience and performance
 */

export class MobileOptimizer {
  private static instance: MobileOptimizer;
  private isInitialized = false;

  static getInstance(): MobileOptimizer {
    if (!MobileOptimizer.instance) {
      MobileOptimizer.instance = new MobileOptimizer();
    }
    return MobileOptimizer.instance;
  }

  /**
   * Initialize mobile optimizations
   */
  initialize(): void {
    if (this.isInitialized || typeof window === 'undefined') return;

    this.setupViewportOptimization();
    this.setupTouchOptimization();
    this.setupPerformanceOptimization();
    this.setupAccessibilityOptimization();
    
    this.isInitialized = true;
    console.log('📱 Mobile optimization initialized');
  }

  /**
   * Setup viewport optimizations
   */
  private setupViewportOptimization(): void {
    // Prevent zoom on input focus (iOS Safari)
    const metaViewport = document.querySelector('meta[name=viewport]');
    if (metaViewport) {
      metaViewport.setAttribute(
        'content',
        'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover'
      );
    }

    // Handle orientation changes
    window.addEventListener('orientationchange', () => {
      setTimeout(() => {
        window.scrollTo(0, 0);
      }, 100);
    });
  }

  /**
   * Setup touch optimizations
   */
  private setupTouchOptimization(): void {
    // Prevent double-tap zoom
    let lastTouchEnd = 0;
    document.addEventListener('touchend', (event) => {
      const now = new Date().getTime();
      if (now - lastTouchEnd <= 300) {
        event.preventDefault();
      }
      lastTouchEnd = now;
    }, false);

    // Enhanced touch feedback
    document.addEventListener('touchstart', (event) => {
      const target = event.target as HTMLElement;
      if (target.tagName === 'BUTTON' || target.getAttribute('role') === 'button') {
        target.style.transform = 'scale(0.98)';
        target.style.opacity = '0.8';
      }
    });

    document.addEventListener('touchend', (event) => {
      const target = event.target as HTMLElement;
      if (target.tagName === 'BUTTON' || target.getAttribute('role') === 'button') {
        setTimeout(() => {
          target.style.transform = '';
          target.style.opacity = '';
        }, 150);
      }
    });
  }

  /**
   * Setup performance optimizations
   */
  private setupPerformanceOptimization(): void {
    // Lazy load images that come into viewport
    if ('IntersectionObserver' in window) {
      const imageObserver = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const img = entry.target as HTMLImageElement;
            if (img.dataset.src) {
              img.src = img.dataset.src;
              img.removeAttribute('data-src');
              imageObserver.unobserve(img);
            }
          }
        });
      });

      document.querySelectorAll('img[data-src]').forEach((img) => {
        imageObserver.observe(img);
      });
    }

    // Preload critical resources
    this.preloadCriticalResources();
  }

  /**
   * Setup accessibility optimizations for mobile
   */
  private setupAccessibilityOptimization(): void {
    // Ensure proper focus management on mobile
    document.addEventListener('focusin', (event) => {
      const target = event.target as HTMLElement;
      if (this.isMobile() && target.tagName === 'INPUT') {
        setTimeout(() => {
          target.scrollIntoView({
            behavior: 'smooth',
            block: 'center'
          });
        }, 300);
      }
    });
  }

  /**
   * Preload critical resources for better performance
   */
  private preloadCriticalResources(): void {
    const criticalResources = [
      '/api/auth/validate-session',
      '/api/health/context'
    ];

    criticalResources.forEach((resource) => {
      const link = document.createElement('link');
      link.rel = 'preload';
      link.as = 'fetch';
      link.href = resource;
      document.head.appendChild(link);
    });
  }

  /**
   * Check if device is mobile
   */
  isMobile(): boolean {
    if (typeof window === 'undefined') return false;
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
      navigator.userAgent
    ) || window.innerWidth < 768;
  }

  /**
   * Check if device is iOS
   */
  isIOS(): boolean {
    if (typeof window === 'undefined') return false;
    return /iPad|iPhone|iPod/.test(navigator.userAgent);
  }

  /**
   * Optimize form inputs for mobile
   */
  optimizeFormInputs(): void {
    const inputs = document.querySelectorAll('input, textarea');
    inputs.forEach((input) => {
      const inputElement = input as HTMLInputElement;
      
      // Set appropriate input modes
      if (inputElement.type === 'email') {
        inputElement.setAttribute('inputmode', 'email');
      } else if (inputElement.type === 'tel') {
        inputElement.setAttribute('inputmode', 'tel');
      } else if (inputElement.type === 'number') {
        inputElement.setAttribute('inputmode', 'numeric');
      }

      // Prevent zoom on focus for iOS
      if (this.isIOS()) {
        inputElement.style.fontSize = '16px';
      }
    });
  }

  /**
   * Handle safe area insets for devices with notches
   */
  handleSafeArea(): void {
    const style = document.createElement('style');
    style.textContent = `
      :root {
        --safe-area-inset-top: env(safe-area-inset-top);
        --safe-area-inset-right: env(safe-area-inset-right);
        --safe-area-inset-bottom: env(safe-area-inset-bottom);
        --safe-area-inset-left: env(safe-area-inset-left);
      }
      
      .safe-area-top {
        padding-top: calc(1rem + var(--safe-area-inset-top, 0px));
      }
      
      .safe-area-bottom {
        padding-bottom: calc(1rem + var(--safe-area-inset-bottom, 0px));
      }
    `;
    document.head.appendChild(style);
  }

  /**
   * Optimize scroll performance
   */
  optimizeScrolling(): void {
    // Add momentum scrolling for iOS
    (document.body.style as any).webkitOverflowScrolling = 'touch';
    
    // Throttle scroll events
    let scrollTimer: NodeJS.Timeout;
    window.addEventListener('scroll', () => {
      clearTimeout(scrollTimer);
      scrollTimer = setTimeout(() => {
        // Handle scroll end
        this.handleScrollEnd();
      }, 150);
    }, { passive: true });
  }

  /**
   * Handle scroll end events
   */
  private handleScrollEnd(): void {
    // Optimize performance when scrolling stops
    if (this.isMobile()) {
      // Force reflow to improve rendering
      document.body.offsetHeight;
    }
  }

  /**
   * Show mobile-specific loading states
   */
  showMobileLoading(message = 'Loading...'): void {
    const loader = document.createElement('div');
    loader.className = 'mobile-loader';
    loader.innerHTML = `
      <div class="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
        <div class="bg-white rounded-lg p-6 max-w-sm mx-4">
          <div class="flex items-center space-x-3">
            <div class="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
            <span class="text-gray-900 font-medium">${message}</span>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(loader);
  }

  /**
   * Hide mobile loading states
   */
  hideMobileLoading(): void {
    const loader = document.querySelector('.mobile-loader');
    if (loader) {
      loader.remove();
    }
  }
}

// Auto-initialize on load
if (typeof window !== 'undefined') {
  window.addEventListener('load', () => {
    MobileOptimizer.getInstance().initialize();
  });
}

export default MobileOptimizer;
