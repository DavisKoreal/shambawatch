/**
 * @fileoverview MarketingPageView — High-Performing Conversion Landing Page.
 * Implements 30 Characteristics of High-Performing Marketing Pages and
 * 30 Proven Conversion Hypotheses.
 * 
 * Gatekeeper Architecture:
 * - Rendered to unauthenticated guests.
 * - Bridges into authentication (AuthModal / Quick Sign-In) to enter the live platform.
 */

import { StructuredLogger } from '../core/structured-logger.js';
import { EventTypes } from '../contracts/event-types.js';
import { Icons } from './icons.js';

export class MarketingPageView {
  /**
   * @param {Object} options
   * @param {HTMLElement} options.mountEl
   * @param {import('../services/auth-service.js').AuthService} options.authService
   * @param {import('../core/event-bus.js').EventBus} options.eventBus
   * @param {Function} options.onLaunchPlatform
   * @param {Function} options.onOpenSignIn
   */
  constructor({ mountEl, authService, eventBus, onLaunchPlatform, onOpenSignIn }) {
    this._mountEl = mountEl;
    this._authService = authService;
    this._eventBus = eventBus;
    this._onLaunchPlatform = onLaunchPlatform;
    this._onOpenSignIn = onOpenSignIn;
    this._logger = new StructuredLogger('MarketingPageView');

    this._timerInterval = null;
    this._socialProofInterval = null;
    this._exitIntentShown = false;
    this._activeDemoMoisture = 34.2;

    this._render();
    this._bindEvents();
    this._startTimers();
  }

  /**
   * Displays the marketing page and hides platform container.
   */
  show() {
    this._mountEl.classList.remove('hidden');
    this._mountEl.style.display = 'block';
    document.documentElement.classList.remove('app-mode');
    document.body.classList.remove('app-mode');
    document.documentElement.classList.add('marketing-mode');
    document.body.classList.add('marketing-mode');
    window.scrollTo({ top: 0, behavior: 'instant' });
  }

  /**
   * Hides the marketing page.
   */
  hide() {
    this._mountEl.classList.add('hidden');
    this._mountEl.style.display = 'none';
    document.documentElement.classList.remove('marketing-mode');
    document.body.classList.remove('marketing-mode');
    document.documentElement.classList.add('app-mode');
    document.body.classList.add('app-mode');
  }

  /**
   * Returns whether the page is currently visible.
   * @returns {boolean}
   */
  isVisible() {
    return !this._mountEl.classList.contains('hidden') && this._mountEl.style.display !== 'none';
  }

  /**
   * Renders the complete Revolut-styled marketing page template.
   * Two-mode rhythm switching between stark black (#000000) and pure white (#ffffff).
   * @private
   */
  _render() {
    // Personalization check: query param for crop or region (Char 30, Hyp 24)
    const urlParams = new URLSearchParams(window.location.search);
    const cropParam = urlParams.get('crop');
    const regionParam = urlParams.get('region') || 'Commercial Agricultural';
    const personalizedCrop = cropParam ? cropParam.charAt(0).toUpperCase() + cropParam.slice(1) : 'High-Yield';

    this._mountEl.innerHTML = `
      <div class="marketing-page" id="marketingPageRoot">

        <!-- BAND 1: URGENCY & SUBSIDY STRIP (Level 0 Dark) -->
        <aside class="mkt-urgency-banner" role="complementary" aria-label="Limited Subsidy Offer">
          <span class="mkt-badge-feature">${Icons.bolt({ size: 13 })} Q4 Planting Subsidy</span>
          <span>18 Subsidized Solar LoRa Gateways Remaining for ${regionParam} Agricultural Basins</span>
          <span class="mkt-timer-box" id="mktCountdownTimer">14d : 08h : 42m : 19s</span>
        </aside>

        <!-- BAND 2: TOP NAVIGATION (64px, Stark Black #000000) -->
        <header class="mkt-nav" role="banner">
          <div class="mkt-container-wide mkt-nav-inner">
            <a href="#" class="mkt-nav-brand" aria-label="Shamba Watch Home">
              <div class="mkt-brand-stamp">S</div>
              <span class="mkt-brand-title">Shamba Watch</span>
            </a>

            <nav class="mkt-nav-menu" aria-label="Quick Navigation">
              <a href="#features" class="mkt-nav-link">Hardware & Probes</a>
              <a href="#comparison" class="mkt-nav-link">Telemetry Benchmarks</a>
              <a href="#plans" class="mkt-nav-link">Field Deployments</a>
              <a href="#faq" class="mkt-nav-link">FAQ</a>
            </nav>

            <div class="mkt-nav-actions">
              <button class="mkt-nav-signin-btn" id="mktNavSignInBtn" type="button" aria-label="Sign in to platform">
                Sign In
              </button>
              <button class="mkt-btn-primary" id="mktNavCtaBtn" type="button">
                <span>Start Free Pilot</span>
                <span>${Icons.arrowUpRight({ size: 14 })}</span>
              </button>
              <!-- Mobile Hamburger Trigger (Hypothesis 17) -->
              <button class="mkt-burger-btn" id="mktBurgerBtn" type="button" aria-label="Toggle mobile navigation menu" aria-expanded="false">
                <span class="mkt-burger-line"></span>
                <span class="mkt-burger-line"></span>
                <span class="mkt-burger-line"></span>
              </button>
            </div>
          </div>

          <!-- Mobile Slide-Down Navigation Drawer (Hypothesis 17 & 24) -->
          <div class="mkt-mobile-drawer" id="mktMobileDrawer">
            <nav class="mkt-drawer-nav" aria-label="Mobile Navigation">
              <a href="#features" class="mkt-drawer-link">Hardware & Probes</a>
              <a href="#comparison" class="mkt-drawer-link">Telemetry Benchmarks</a>
              <a href="#plans" class="mkt-drawer-link">Field Deployments</a>
              <a href="#faq" class="mkt-drawer-link">FAQ</a>
            </nav>
            <div class="mkt-drawer-actions">
              <button class="mkt-btn-primary" id="mktDrawerCtaBtn" type="button">
                <span>Start Free Pilot</span>
                <span>${Icons.arrowUpRight({ size: 14 })}</span>
              </button>
              <button class="mkt-btn-outline-dark" id="mktDrawerSignInBtn" type="button">
                <span>${Icons.lock({ size: 14 })} Sign In to Platform</span>
              </button>
            </div>
          </div>
        </header>

        <!-- BAND 3: HERO STORYTELLING BAND (Stark Black #000000) -->
        <section class="mkt-hero-band" aria-labelledby="heroTitle">
          <div class="mkt-container">
            <div class="mkt-hero-layout">
              <div class="mkt-hero-header">
                
                <div class="mkt-badge-tag">
                  <span class="mkt-pulse-dot"></span>
                  <span>Live LoRaWAN IoT Telemetry · ${regionParam} Basin</span>
                </div>

                <!-- Oversized Aeonik Pro Display Headline (136px / clamp) -->
                <h1 class="mkt-display-xxl" id="heroTitle">
                  Cut Crop Loss by 40%.
                </h1>
                
                <div class="mkt-hero-copy">
                  <p class="mkt-body-lg">
                    Autonomous solar nodes monitor root-zone moisture, canopy microclimate, and water stress 24/7 across ${personalizedCrop} acreage. Continuous 15km LoRa connectivity. Zero cellular SIMs. Zero guessing.
                  </p>
                </div>

                <!-- High-Contrast Hero Actions: White Pill Primary + Outlined Pill Secondary -->
                <div class="mkt-hero-actions-row">
                  <button class="mkt-btn-primary" id="mktHeroCtaBtn" type="button">
                    <span>Start 14-Day Free Pilot</span>
                    <span>${Icons.arrowUpRight({ size: 16 })}</span>
                  </button>
                  <button class="mkt-btn-outline-dark" id="mktHeroSignInBtn" type="button">
                    <span>${Icons.lock({ size: 16 })} Sign In to Platform</span>
                  </button>
                </div>

                <!-- Trust Badges below CTA -->
                <div class="mkt-hero-trust-strip">
                  <span class="mkt-badge-tag">${Icons.shieldCheck({ size: 13 })} 256-bit AES LoRaWAN</span>
                  <span class="mkt-badge-tag">${Icons.sprout({ size: 13 })} KALRO Agronomy Standard</span>
                  <span class="mkt-badge-tag">${Icons.sun({ size: 13 })} IP68 Weatherproof Mast</span>
                  <span class="mkt-badge-tag">${Icons.shield({ size: 13 })} Guaranteed Sensor Accuracy</span>
                </div>

              </div>

              <!-- Hero Visual Card (Photography-led story visual) -->
              <div class="mkt-hero-visual-card" aria-label="Field Telemetry Mast Visual">
                <img src="images/hero-mast.jpg" alt="Solar-powered LoRaWAN agricultural telemetry mast in highland tea farm at sunrise" class="mkt-hero-visual-img">
                <div class="mkt-hero-visual-overlay">
                  <div class="mkt-hero-visual-badge-top">
                    <span class="mkt-badge-tag">Station #02010509</span>
                    <span class="mkt-chip-teal">
                      <span class="mkt-pulse-dot"></span>
                      <span>Solar Autonomy Active</span>
                    </span>
                  </div>
                  <div class="mkt-hero-visual-badge-bottom">
                    <div class="mkt-hero-visual-stat">
                      <strong>1,890m ASL</strong>
                      <span>Naivasha Highland Basin</span>
                    </div>
                    <div class="mkt-hero-visual-stat" style="text-align:right;">
                      <strong style="color:var(--revo-accent-teal);">99.8%</strong>
                      <span>LoRa Packet Reliability</span>
                    </div>
                  </div>
                </div>
              </div>

            </div>
          </div>
        </section>

        <!-- BAND 4: FULL-BLEED PRODUCT MOCKUP HERO BAND (Stage Level 4 on #000000) -->
        <section class="mkt-mockup-band" aria-label="Interactive Live Telemetry Preview">
          <div class="mkt-container-wide">
            <div class="mkt-mockup-console">
              
              <!-- Console Top Bar -->
              <div class="mkt-console-topbar">
                <div class="mkt-console-dots">
                  <div class="mkt-console-dot"></div>
                  <div class="mkt-console-dot"></div>
                  <div class="mkt-console-dot"></div>
                </div>
                <div class="mkt-console-meta">SHAMBA-OS // LORAWAN TELEMETRY ENGINE // NODE: #02010509</div>
                <div class="mkt-chip-teal">
                  <span class="mkt-pulse-dot"></span>
                  <span>LIVE RECEPTION</span>
                </div>
              </div>

              <div class="mkt-console-body">
                
                <!-- Station Title & Metadata -->
                <div class="mkt-console-station-header">
                  <div class="mkt-station-title-group">
                    <strong>Naivasha Agricultural Basin · Station #01</strong>
                    <span>DevAddr: 02010509 · Root Depth: 0–40cm · High-Density Sensor Array</span>
                  </div>
                  <div class="mkt-chip-blue">
                    <span>99.8% GATEWAY UPTIME</span>
                  </div>
                </div>

                <!-- 4-Up Telemetry Metric Cards with Saturated Revolut Product Chips -->
                <div class="mkt-telemetry-grid">
                  
                  <div class="mkt-metric-tile">
                    <div class="mkt-metric-tile-label">Root Moisture (-20cm)</div>
                    <div class="mkt-metric-tile-value" id="mktLiveMoistVal">34.2%</div>
                    <div>
                      <span class="mkt-chip-teal">${Icons.check({ size: 12 })} Optimal Field Capacity</span>
                    </div>
                  </div>

                  <div class="mkt-metric-tile">
                    <div class="mkt-metric-tile-label">Canopy Air Temp</div>
                    <div class="mkt-metric-tile-value">22.4°C</div>
                    <div>
                      <span class="mkt-chip-blue">${Icons.check({ size: 12 })} Safe Transpiration</span>
                    </div>
                  </div>

                  <div class="mkt-metric-tile">
                    <div class="mkt-metric-tile-label">Vapor Pressure Deficit</div>
                    <div class="mkt-metric-tile-value">1.18 kPa</div>
                    <div>
                      <span class="mkt-chip-pink">${Icons.check({ size: 12 })} Moderate Demand</span>
                    </div>
                  </div>

                  <div class="mkt-metric-tile">
                    <div class="mkt-metric-tile-label">Solar Battery Reserve</div>
                    <div class="mkt-metric-tile-value">98%</div>
                    <div>
                      <span class="mkt-chip-green">${Icons.battery({ size: 12 })} LiFePO4 Full Reserve</span>
                    </div>
                  </div>

                </div>

                <!-- Split Layout: Macro Probe Photo & Timeseries Wave -->
                <div class="mkt-console-split">
                  
                  <!-- Live Probe Physical Installation Visual -->
                  <div class="mkt-probe-showcase">
                    <div class="mkt-probe-photo-wrap">
                      <img src="images/soil-probe.jpg" alt="Rugged stainless steel root-zone soil moisture probe" class="mkt-probe-photo">
                      <div class="mkt-probe-photo-overlay">
                        <span class="mkt-chip-teal" style="align-self:flex-start;">IP68 Sub-Surface Probe</span>
                      </div>
                    </div>
                    <div class="mkt-probe-details">
                      <div class="mkt-depth-indicator">
                        <span style="color:var(--revo-on-dark-mute);">-10cm Topsoil Layer</span>
                        <strong style="color:#ffffff;">28.4% Moist</strong>
                      </div>
                      <div class="mkt-depth-indicator" style="border-color:rgba(0,168,126,0.3); background:rgba(0,168,126,0.08);">
                        <span style="color:var(--revo-accent-teal); font-weight:600;">-20cm Active Root Zone</span>
                        <strong style="color:var(--revo-accent-teal);">34.2% Optimal</strong>
                      </div>
                      <div class="mkt-depth-indicator">
                        <span style="color:var(--revo-on-dark-mute);">-40cm Deep Subsoil</span>
                        <strong style="color:#ffffff;">39.1% Reserve</strong>
                      </div>
                    </div>
                  </div>

                  <!-- Animated Timeseries Telemetry Wave Preview -->
                  <div class="mkt-console-wave-container">
                    <div class="mkt-wave-meta-row">
                      <span>Continuous Soil Dynamics · Last 24 Hours</span>
                      <span style="color:var(--revo-accent-teal);">Active Telemetry Stream</span>
                    </div>
                    <svg class="mkt-console-wave-svg" viewBox="0 0 600 110" preserveAspectRatio="none">
                      <defs>
                        <linearGradient id="revoGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                          <stop offset="0%" stop-color="#494fdf" stop-opacity="0.45"></stop>
                          <stop offset="100%" stop-color="#494fdf" stop-opacity="0.0"></stop>
                        </linearGradient>
                      </defs>
                      <path d="M0,75 Q75,35 150,55 T300,30 T450,65 T600,40 L600,110 L0,110 Z" fill="url(#revoGrad)"></path>
                      <path d="M0,75 Q75,35 150,55 T300,30 T450,65 T600,40" fill="none" stroke="#4f55f1" stroke-width="2.5"></path>
                      <circle cx="600" cy="40" r="5" fill="#ffffff" stroke="#494fdf" stroke-width="2.5"></circle>
                    </svg>
                  </div>

                </div>

                <!-- Interactive Launch Prompt -->
                <div class="mkt-console-footer-cta">
                  <span>Interactive Telemetry Engine · Real-Time Dynamic Ingestion</span>
                  <button class="mkt-btn-pill-sm" id="mktDemoLaunchBtn" type="button">
                    <span>Launch Live Platform</span>
                    <span>${Icons.arrowUpRight({ size: 14 })}</span>
                  </button>
                </div>

              </div>
            </div>
          </div>
        </section>

                <!-- Interactive Launch Prompt -->
                <div class="mkt-console-footer-cta">
                  <span>Interactive Telemetry Engine · Real-Time Dynamic Ingestion</span>
                  <button class="mkt-btn-pill-sm" id="mktDemoLaunchBtn" type="button">
                    <span>Launch Live Platform</span>
                    <span>${Icons.arrowUpRight({ size: 14 })}</span>
                  </button>
                </div>

              </div>
            </div>
          </div>
        </section>

        <!-- BAND 5: LOGOS & CREDIBILITY (Stark Black #000000) -->
        <section class="mkt-logos-band" aria-label="Partner and Customer Organizations">
          <div class="mkt-container">
            <div class="mkt-logos-title">Trusted by agricultural leaders & estate operators</div>
            <div class="mkt-logos-grid">
              <div class="mkt-logo-card">${Icons.sprout({ size: 15 })} Nakuru Farmers Co-operative</div>
              <div class="mkt-logo-card">${Icons.leaf({ size: 15 })} Naivasha Flower Growers Association</div>
              <div class="mkt-logo-card">${Icons.flask({ size: 15 })} KALRO Agricultural Research</div>
              <div class="mkt-logo-card">${Icons.leaf({ size: 15 })} East Africa Tea Trade Chamber</div>
            </div>
          </div>
        </section>

        <!-- BAND 6: CATALOGUE BAND 1 (Pillars & Benchmarks on Pure White #ffffff) -->
        <section class="mkt-catalogue-band" id="features" aria-labelledby="catTitle">
          <div class="mkt-container">
            
            <div class="mkt-catalogue-header">
              <span class="mkt-badge-tag-light">Agronomic Architecture</span>
              <h2 class="mkt-display-lg" id="catTitle" style="margin-top:14px;">
                Designed for Field Autonomy. Built for Heavy Production.
              </h2>
              <p class="mkt-body-lg">
                Replace manual soil feel with calibrated precision telemetry. Continuous measurements direct to your smartphone with zero cellular carrier fees.
              </p>
            </div>

            <!-- 3-Up Feature Grid with Evocative Story Photography -->
            <div class="mkt-feature-grid">
              
              <div class="mkt-feature-card-light">
                <div>
                  <div class="mkt-card-img-wrap">
                    <img src="images/lora-gateway.jpg" alt="15km LoRaWAN Solar Gateway Mast overlooking agricultural valley" class="mkt-card-photo" loading="lazy">
                  </div>
                  <div class="mkt-feature-card-top">
                    <div class="mkt-feature-card-icon mkt-icon-teal">
                      ${Icons.radio({ size: 22 })}
                    </div>
                    <h3>15km LoRaWAN Mesh</h3>
                    <p>Long-range sub-gigahertz telemetry passes effortlessly through highland topography, tree canopies, and metal greenhouses without requiring individual SIM cards.</p>
                  </div>
                </div>
                <div style="margin-top:20px;">
                  <span class="mkt-chip-teal">Zero SIM Subscriptions</span>
                </div>
              </div>

              <div class="mkt-feature-card-light">
                <div>
                  <div class="mkt-card-img-wrap">
                    <img src="images/solar-weather.jpg" alt="Industrial solar panel and LiFePO4 battery pack on weather mast" class="mkt-card-photo" loading="lazy">
                  </div>
                  <div class="mkt-feature-card-top">
                    <div class="mkt-feature-card-icon mkt-icon-blue">
                      ${Icons.sun({ size: 22 })}
                    </div>
                    <h3>45-Day Solar Dark Reserve</h3>
                    <p>Industrial LiFePO4 cells paired with intelligent MPPT charging run uninterrupted through monsoon overcast seasons and prolonged highland fog covers.</p>
                  </div>
                </div>
                <div style="margin-top:20px;">
                  <span class="mkt-chip-blue">LiFePO4 Chemistry</span>
                </div>
              </div>

              <div class="mkt-feature-card-light">
                <div>
                  <div class="mkt-card-img-wrap">
                    <img src="images/agronomist-tablet.jpg" alt="Agronomist inspecting smart greenhouse with live telemetry" class="mkt-card-photo" loading="lazy">
                  </div>
                  <div class="mkt-feature-card-top">
                    <div class="mkt-feature-card-icon mkt-icon-violet">
                      ${Icons.sparkles({ size: 22 })}
                    </div>
                    <h3>AI Agronomist Assistant</h3>
                    <p>Instant conversational queries on water demand, wilt points, and irrigation timing calculated directly against live soil and microclimate physics.</p>
                  </div>
                </div>
                <div style="margin-top:20px;">
                  <span class="mkt-badge-feature" style="font-size:11px;">Built-In Intelligence</span>
                </div>
              </div>

            </div>

            <!-- Quantitative 4-Card Strip on White Surface Soft (#f4f4f4) -->
            <div class="mkt-metrics-strip">
              <div class="mkt-metric-pill-tile">
                <strong>38.4%</strong>
                <span>Average Water Saved</span>
                <small>Through root-zone drip triggering vs timed irrigation cycles.</small>
              </div>
              <div class="mkt-metric-pill-tile">
                <strong>42%</strong>
                <span>Reduction in Wilt</span>
                <small>Early warning alerts before irreversible crop stress occurs.</small>
              </div>
              <div class="mkt-metric-pill-tile">
                <strong>15 km</strong>
                <span>Gateway Range</span>
                <small>Single solar gateway connects entire ridge without cellular deadzones.</small>
              </div>
              <div class="mkt-metric-pill-tile">
                <strong>12,400+</strong>
                <span>Acres Protected</span>
                <small>From Mau Narok highlands to Naivasha horticulture basins.</small>
              </div>
            </div>

            <!-- Clean Comparison Table inside White Catalogue Band -->
            <div class="mkt-table-wrapper" id="comparison">
              <table class="mkt-comparison-table">
                <thead>
                  <tr>
                    <th>Capability / Feature</th>
                    <th class="revo-highlight">Shamba Watch 2.0</th>
                    <th>Manual Soil Gauges</th>
                    <th>Imported Satellite Stations</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td><strong>Telemetry Frequency</strong></td>
                    <td class="revo-highlight">Continuous (Real-Time Stream)</td>
                    <td>Manual (Once per day)</td>
                    <td>Periodic (4–8 hr delay)</td>
                  </tr>
                  <tr>
                    <td><strong>Cellular SIM Required per Probe</strong></td>
                    <td class="revo-highlight">No (LoRa 15km Mesh)</td>
                    <td>No (Offline Gauge)</td>
                    <td>Yes (Expensive Data Plans)</td>
                  </tr>
                  <tr>
                    <td><strong>Autonomous Solar Power</strong></td>
                    <td class="revo-highlight">Yes (45-Day Dark Reserve)</td>
                    <td>N/A</td>
                    <td>Lead-Acid (Prone to failure)</td>
                  </tr>
                  <tr>
                    <td><strong>Field AI Agronomist Chat</strong></td>
                    <td class="revo-highlight">Included (24/7 Guidance)</td>
                    <td>None</td>
                    <td>Raw charts only</td>
                  </tr>
                  <tr>
                    <td><strong>Pricing & Deployment</strong></td>
                    <td class="revo-highlight">Contact for Pricing</td>
                    <td>High Labor Overhead</td>
                    <td>Costly Proprietary Imports</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div class="mkt-table-cta-row">
              <button class="mkt-btn-dark mkt-trigger-signup" type="button">
                <span>Start Your 14-Day Free Pilot</span>
                <span>${Icons.arrowUpRight({ size: 16 })}</span>
              </button>
            </div>

          </div>
        </section>

        <!-- BAND 7: STORYTELLING BAND 2 (Stark Black #000000) -->
        <section class="mkt-story-band" aria-labelledby="storyTitle">
          <div class="mkt-container">
            
            <div class="mkt-story-header">
              <span class="mkt-badge-tag">Operational Comparison</span>
              <h2 class="mkt-display-lg" id="storyTitle" style="margin-top:14px;">
                Farming Shouldn't Be a High-Stakes Guessing Game.
              </h2>
              <p class="mkt-body-lg">
                Over-irrigation rots root zones and wastes costly pump fuel. Under-irrigation permanently stunts harvest grade. Shamba Watch closes the loop.
              </p>
            </div>

            <!-- 2-Up Comparison Cards: The Old Way vs The Shamba Watch Way -->
            <div class="mkt-duo-grid">
              
              <div class="mkt-feature-card-dark">
                <div class="mkt-card-img-wrap" style="height:170px;">
                  <img src="images/drought-cracked.jpg" alt="Parched cracked drought soil" class="mkt-card-photo" style="filter:contrast(1.1) brightness(0.85);" loading="lazy">
                </div>
                <div class="mkt-card-title-row">
                  <span style="color:var(--revo-accent-danger);">${Icons.alertTriangle({ size: 20 })}</span>
                  <h3>The Old Way (Blind Farming)</h3>
                </div>
                <ul class="mkt-bullet-list">
                  <li>
                    <span class="bullet-icon" style="color:var(--revo-accent-danger);">${Icons.x({ size: 15 })}</span>
                    <span>Walking fields feeling topsoil with fingers — missing sub-surface root drought.</span>
                  </li>
                  <li>
                    <span class="bullet-icon" style="color:var(--revo-accent-danger);">${Icons.x({ size: 15 })}</span>
                    <span>Relying on generic regional forecasts that miss localized valley microclimates.</span>
                  </li>
                  <li>
                    <span class="bullet-icon" style="color:var(--revo-accent-danger);">${Icons.x({ size: 15 })}</span>
                    <span>Costly cellular SIM cards per probe with frequent battery deaths and SIM disconnects.</span>
                  </li>
                  <li>
                    <span class="bullet-icon" style="color:var(--revo-accent-danger);">${Icons.x({ size: 15 })}</span>
                    <span>Frost or heat stress alerts received after 30% of the crop has already suffered necrosis.</span>
                  </li>
                </ul>
              </div>

              <div class="mkt-feature-card-dark accent-border">
                <div class="mkt-card-img-wrap" style="height:170px;">
                  <img src="images/precision-irrigation.jpg" alt="Lush precision drip irrigated crops" class="mkt-card-photo" loading="lazy">
                </div>
                <div class="mkt-card-title-row">
                  <span style="color:var(--revo-accent-teal);">${Icons.checkCircle({ size: 20 })}</span>
                  <h3>The Shamba Watch Way</h3>
                </div>
                <ul class="mkt-bullet-list">
                  <li>
                    <span class="bullet-icon" style="color:var(--revo-accent-teal);">${Icons.check({ size: 15 })}</span>
                    <span>Continuous 24/7 moisture telemetry at root depths (-10cm, -20cm, -40cm).</span>
                  </li>
                  <li>
                    <span class="bullet-icon" style="color:var(--revo-accent-teal);">${Icons.check({ size: 15 })}</span>
                    <span>Microclimate masts measuring VPD, canopy temperature, and humidity directly on your block.</span>
                  </li>
                  <li>
                    <span class="bullet-icon" style="color:var(--revo-accent-teal);">${Icons.check({ size: 15 })}</span>
                    <span>Solar-powered autonomous LoRa nodes with 45-day battery reserve and 15km range.</span>
                  </li>
                  <li>
                    <span class="bullet-icon" style="color:var(--revo-accent-teal);">${Icons.check({ size: 15 })}</span>
                    <span>AI Agronomist assistant offering instant actionable irrigation prescriptions on your phone.</span>
                  </li>
                </ul>
              </div>

            </div>

            <!-- Verified Testimonials 3-Up Grid with Authentic Photo Portraits -->
            <div class="mkt-testimonials-grid">
              
              <div class="mkt-testimonial-card-dark">
                <p class="mkt-quote-text">
                  "We reduced our drip irrigation expenditure by 34% in the first 60 days while increasing our export yield grade by 18%. Shamba Watch paid for itself in less than two weeks."
                </p>
                <div>
                  <span class="mkt-chip-teal">${Icons.star({ size: 13 })} 34% Pump Fuel Saved</span>
                  <div class="mkt-testimonial-author">
                    <div class="mkt-author-avatar">
                      <img src="images/farmer-mwangi.jpg" alt="Mwangi Karanja, Lead Agronomist" class="mkt-author-photo" loading="lazy">
                    </div>
                    <div class="mkt-author-info">
                      <strong>Mwangi Karanja</strong>
                      <span>Lead Agronomist · Oserian Flower Basin</span>
                    </div>
                  </div>
                </div>
              </div>

              <div class="mkt-testimonial-card-dark">
                <p class="mkt-quote-text">
                  "Before Shamba Watch, frost warnings came too late. The SMS and live telemetry alerts saved 40 acres of seed potato crop in one freeze event. Unmatched reliability."
                </p>
                <div>
                  <span class="mkt-chip-blue">${Icons.star({ size: 13 })} 40 Acres Saved</span>
                  <div class="mkt-testimonial-author">
                    <div class="mkt-author-avatar">
                      <img src="images/farmer-faith.jpg" alt="Faith Chebet, Operations Director" class="mkt-author-photo" loading="lazy">
                    </div>
                    <div class="mkt-author-info">
                      <strong>Faith Chebet</strong>
                      <span>Operations Director · Molo Highland Producers</span>
                    </div>
                  </div>
                </div>
              </div>

              <div class="mkt-testimonial-card-dark">
                <p class="mkt-quote-text">
                  "Our field stations in Rongai used to constantly drop offline due to poor 3G coverage. Shamba Watch's LoRa mesh connects across the entire ridge with zero monthly SIM costs."
                </p>
                <div>
                  <span class="mkt-chip-green">${Icons.star({ size: 13 })} 99.8% Gateway Uptime</span>
                  <div class="mkt-testimonial-author">
                    <div class="mkt-author-avatar">
                      <img src="images/farmer-david.jpg" alt="David Kiprono, Estate Manager" class="mkt-author-photo" loading="lazy">
                    </div>
                    <div class="mkt-author-info">
                      <strong>David Kiprono</strong>
                      <span>Estate Manager · Rongai Cereal Growers</span>
                    </div>
                  </div>
                </div>
              </div>

            </div>

          </div>
        </section>

        <!-- BAND 8: THE SIGNATURE PLANNING SECTION (Stark Black #000000) -->
        <!-- Revolut Pattern: Level 2 #16181a cards flanking Level 3 Cobalt-Violet #494fdf Featured Card -->
        <section class="mkt-plans-band" id="plans" aria-labelledby="plansTitle">
          <div class="mkt-container">
            
            <div class="mkt-plans-header">
              <span class="mkt-badge-tag">Field Deployments</span>
              <h2 class="mkt-display-lg" id="plansTitle" style="margin-top:14px;">
                Engineered for Every Acreage.
              </h2>
              <p class="mkt-body-lg">
                Hardware installed and calibrated directly on your soil by local agronomic engineers. Contact us for custom deployment pricing.
              </p>
            </div>

            <div class="mkt-plans-grid">
              
              <!-- Tier 1: Smallholder Starter (Level 2 #16181a) -->
              <div class="mkt-plan-card">
                <div class="mkt-plan-header-block">
                  <div class="mkt-plan-img-wrap">
                    <img src="images/farm-starter.jpg" alt="Smallholder starter block" class="mkt-plan-photo" loading="lazy">
                  </div>
                  <div class="mkt-plan-top-row">
                    <h3>Starter</h3>
                    <span class="mkt-badge-tag">Single Block</span>
                  </div>
                  <p class="mkt-plan-desc">For single-block family farms and high-value greenhouses.</p>
                  
                  <div class="mkt-plan-price-tag">
                    <span class="mkt-plan-price-amount">Contact for Pricing</span>
                    <span class="mkt-plan-price-period">Custom Field Deployment</span>
                  </div>

                  <ul class="mkt-plan-features-list">
                    <li><span class="check-icon" style="color:var(--revo-accent-teal);">${Icons.check({ size: 15 })}</span> 1 Solar Field Monitoring Station</li>
                    <li><span class="check-icon" style="color:var(--revo-accent-teal);">${Icons.check({ size: 15 })}</span> Dual-depth root moisture telemetry</li>
                    <li><span class="check-icon" style="color:var(--revo-accent-teal);">${Icons.check({ size: 15 })}</span> SMS & Web threshold alerts</li>
                    <li><span class="check-icon" style="color:var(--revo-accent-teal);">${Icons.check({ size: 15 })}</span> Community agronomic support</li>
                  </ul>
                </div>

                <button class="mkt-btn-outline-dark mkt-trigger-signup" type="button" style="width:100%;">
                  <span>Contact for Pricing</span>
                  <span>${Icons.arrowUpRight({ size: 14 })}</span>
                </button>
              </div>

              <!-- Tier 2: Commercial Basin Pro (Level 3 Cobalt Violet #494fdf Inversion) -->
              <div class="mkt-plan-card-featured">
                <div class="mkt-plan-header-block">
                  <div class="mkt-plan-img-wrap">
                    <img src="images/farm-commercial.jpg" alt="Commercial agriculture estate" class="mkt-plan-photo" loading="lazy">
                  </div>
                  <div class="mkt-plan-top-row">
                    <h3>Commercial</h3>
                    <span style="background:rgba(255,255,255,0.22); color:#ffffff; font-size:12px; font-weight:700; padding:4px 12px; border-radius:9999px; text-transform:uppercase; letter-spacing:0.04em;">Most Popular</span>
                  </div>
                  <p class="mkt-plan-desc" style="color:rgba(255,255,255,0.9);">For commercial farms, tea estates & flower growers.</p>
                  
                  <div class="mkt-plan-price-tag">
                    <span class="mkt-plan-price-amount">Contact for Pricing</span>
                    <span class="mkt-plan-price-period" style="color:rgba(255,255,255,0.85);">Commercial Field Package</span>
                  </div>

                  <ul class="mkt-plan-features-list">
                    <li><span class="check-icon">${Icons.check({ size: 15 })}</span> Up to 5 Solar Field Stations</li>
                    <li><span class="check-icon">${Icons.check({ size: 15 })}</span> Full LoRaWAN 15km Gateway mast</li>
                    <li><span class="check-icon">${Icons.check({ size: 15 })}</span> Unlimited Farmer & Agronomist accounts</li>
                    <li><span class="check-icon">${Icons.check({ size: 15 })}</span> AI Agronomist Query Assistant</li>
                    <li><span class="check-icon">${Icons.check({ size: 15 })}</span> 30-Day historical timeseries analytics</li>
                  </ul>
                </div>

                <!-- White Pill Button on Cobalt Violet Card (Revolut Signature) -->
                <button class="mkt-btn-primary mkt-trigger-signup" type="button" style="width:100%;">
                  <span>Contact for Pricing</span>
                  <span>${Icons.arrowUpRight({ size: 14 })}</span>
                </button>
              </div>

              <!-- Tier 3: Co-operative Basin (Level 2 #16181a) -->
              <div class="mkt-plan-card">
                <div class="mkt-plan-header-block">
                  <div class="mkt-plan-img-wrap">
                    <img src="images/farm-enterprise.jpg" alt="Enterprise agricultural basin" class="mkt-plan-photo" loading="lazy">
                  </div>
                  <div class="mkt-plan-top-row">
                    <h3>Enterprise</h3>
                    <span class="mkt-badge-tag">Basin Network</span>
                  </div>
                  <p class="mkt-plan-desc">For co-operatives, agribusinesses & basin projects.</p>
                  
                  <div class="mkt-plan-price-tag">
                    <span class="mkt-plan-price-amount">Contact for Pricing</span>
                    <span class="mkt-plan-price-period">Enterprise & Basin Network</span>
                  </div>

                  <ul class="mkt-plan-features-list">
                    <li><span class="check-icon" style="color:var(--revo-accent-teal);">${Icons.check({ size: 15 })}</span> Up to 20 Solar Field Stations</li>
                    <li><span class="check-icon" style="color:var(--revo-accent-teal);">${Icons.check({ size: 15 })}</span> Multi-gateway fault tolerance</li>
                    <li><span class="check-icon" style="color:var(--revo-accent-teal);">${Icons.check({ size: 15 })}</span> Custom REST & Webhook data pipelines</li>
                    <li><span class="check-icon" style="color:var(--revo-accent-teal);">${Icons.check({ size: 15 })}</span> Dedicated agronomist field calibration</li>
                    <li><span class="check-icon" style="color:var(--revo-accent-teal);">${Icons.check({ size: 15 })}</span> 99.9% Enterprise SLA</li>
                  </ul>
                </div>

                <button class="mkt-btn-outline-dark mkt-trigger-signup" type="button" style="width:100%;">
                  <span>Contact Agribusiness Team</span>
                  <span>${Icons.arrowUpRight({ size: 14 })}</span>
                </button>
              </div>

            </div>

            <!-- Assurance Box -->
            <div class="mkt-assurance-box">
              <span class="mkt-assurance-icon">${Icons.shieldCheck({ size: 36 })}</span>
              <div class="mkt-assurance-text">
                <strong>Engineered & Calibrated On-Site</strong>
                <span>Every deployment is calibrated on your specific soil type with custom depth probes to guarantee accurate real-time telemetry from day one.</span>
              </div>
            </div>

          </div>
        </section>

        <!-- BAND 9: CATALOGUE BAND 2 (Pure White #ffffff) -->
        <section class="mkt-inquiry-band" id="faq" aria-labelledby="inquiryTitle">
          <div class="mkt-container">
            
            <!-- 2-Field Lead Capture Card (text-input: 56px, rounded-12px) -->
            <div class="mkt-lead-card">
              <div class="mkt-lead-header">
                <span class="mkt-badge-tag-light">Quick Inquiry</span>
                <h2 class="mkt-display-md" id="inquiryTitle" style="margin-top:10px;">
                  Request a Custom Quote & Field Survey
                </h2>
                <p class="mkt-body-md">
                  Tell us your location and crop. Our team will contact you with custom pricing and assess your field LoRa coverage within 24 hours.
                </p>
              </div>

              <form class="mkt-lead-form-grid" id="mktLeadForm">
                <input type="text" class="mkt-text-input" id="mktLeadName" placeholder="Your Full Name (e.g. John Chege)" required>
                <input type="text" class="mkt-text-input" id="mktLeadContact" placeholder="Email or Phone (e.g. 0712 345 678)" required>
                <button type="submit" class="mkt-btn-dark" id="mktLeadSubmitBtn">
                  <span>Schedule Free Field Survey</span>
                  <span>${Icons.arrowUpRight({ size: 14 })}</span>
                </button>
              </form>
              <div id="mktLeadFeedback" class="mkt-lead-feedback" style="display:none;"></div>
            </div>

            <!-- FAQ Accordion -->
            <div class="mkt-faq-wrapper">
              <div class="mkt-faq-header">
                <span class="mkt-badge-tag-light">Frequently Asked Questions</span>
                <h2 class="mkt-display-md" style="margin-top:10px;">Common Inquiries</h2>
                <p class="mkt-body-md">Everything you need to know about installation, range, and accuracy.</p>
              </div>

              <div class="mkt-faq-list">
                
                <div class="mkt-faq-item open">
                  <button class="mkt-faq-question" type="button">
                    <span class="q-title">1. Does Shamba Watch work without 3G/4G coverage on my farm?</span>
                    <span class="toggle-icon">+</span>
                  </button>
                  <div class="mkt-faq-answer">
                    Yes! That is exactly what Shamba Watch was engineered for. Our field sensors use 868MHz LoRaWAN wireless technology, transmitting telemetry up to 15 kilometers over hills and valleys to a central solar gateway mast. No SIM cards or monthly data bundles are required on your field probes.
                  </div>
                </div>

                <div class="mkt-faq-item">
                  <button class="mkt-faq-question" type="button">
                    <span class="q-title">2. What happens during the rainy or cloudy season without bright sun?</span>
                    <span class="toggle-icon">+</span>
                  </button>
                  <div class="mkt-faq-answer">
                    Every field probe and gateway includes industrial LiFePO4 solar batteries with an autonomous power management circuit. Even in complete, continuous darkness or torrential monsoons, the stations run continuously for 45 days on internal battery reserve alone.
                  </div>
                </div>

                <div class="mkt-faq-item">
                  <button class="mkt-faq-question" type="button">
                    <span class="q-title">3. How quickly can I install and start viewing soil moisture readings?</span>
                    <span class="toggle-icon">+</span>
                  </button>
                  <div class="mkt-faq-answer">
                    In less than 10 minutes. Probes arrive pre-calibrated for agricultural volcanic and loam soils. You simply auger a borehole to root zone depth, insert the probe, clamp the solar mast, and the live stream immediately populates on your dashboard.
                  </div>
                </div>

                <div class="mkt-faq-item">
                  <button class="mkt-faq-question" type="button">
                    <span class="q-title">4. Can multiple farm workers or agronomists access the same field?</span>
                    <span class="toggle-icon">+</span>
                  </button>
                  <div class="mkt-faq-answer">
                    Yes. Shamba Watch includes full Role-Based Access Control (RBAC). Estate managers can assign individual stations to specific block supervisors or agronomists, giving each team member customized view permissions.
                  </div>
                </div>

                <div class="mkt-faq-item">
                  <button class="mkt-faq-question" type="button">
                    <span class="q-title">5. How does pricing and deployment work?</span>
                    <span class="toggle-icon">+</span>
                  </button>
                  <div class="mkt-faq-answer">
                    Pricing is tailored based on your farm acreage, topography, and probe density requirements. Contact us for custom pricing and our engineering team will provide a tailored deployment estimate.
                  </div>
                </div>

              </div>
            </div>

          </div>
        </section>

        <!-- BAND 10: GLOBAL FOOTER (Stark Black #000000) -->
        <footer class="mkt-footer" role="contentinfo">
          <div class="mkt-container">
            <div class="mkt-footer-top">
              
              <div class="mkt-footer-brand">
                <div style="display:flex; align-items:center; gap:12px;">
                  <div class="mkt-brand-stamp">S</div>
                  <span class="mkt-brand-title" style="font-size:20px;">Shamba Watch</span>
                </div>
                <p>
                  Industrial precision IoT telemetry and agronomist intelligence for commercial agriculture. Autonomous solar LoRaWAN networks engineered for production basins.
                </p>
              </div>

              <div class="mkt-footer-col">
                <h4>Platform</h4>
                <ul class="mkt-footer-links">
                  <li><a href="#" class="mkt-trigger-signup">Live Telemetry Map</a></li>
                  <li><a href="#" class="mkt-trigger-signup">LoRa Probe Fleet</a></li>
                  <li><a href="#" class="mkt-trigger-signup">Agronomist AI Chat</a></li>
                  <li><a href="#" class="mkt-trigger-signup">Station RBAC Console</a></li>
                </ul>
              </div>

              <div class="mkt-footer-col">
                <h4>Hardware</h4>
                <ul class="mkt-footer-links">
                  <li><a href="#">LoRaWAN Mast v2</a></li>
                  <li><a href="#">Dual-Depth Probe</a></li>
                  <li><a href="#">LiFePO4 Solar Pack</a></li>
                  <li><a href="#">Microclimate Station</a></li>
                </ul>
              </div>

              <div class="mkt-footer-col">
                <h4>Compliance</h4>
                <ul class="mkt-footer-links">
                  <li><a href="#">KALRO Standard</a></li>
                  <li><a href="#">IP68 Ingress Test</a></li>
                  <li><a href="#">Privacy Policy</a></li>
                  <li><a href="#">Terms of Service</a></li>
                </ul>
              </div>

            </div>

            <div class="mkt-footer-bottom">
              <div>© 2026 Shamba Watch Precision IoT. All rights reserved.</div>
              <div style="display:flex; gap:20px;">
                <span>256-bit AES Encryption</span>
                <span>LoRaWAN EU868 / AS923</span>
                <span>Solar Autonomous</span>
              </div>
            </div>
          </div>
        </footer>

        <!-- STICKY MOBILE CTA BAR (Bottom, Dark) -->
        <div class="mkt-sticky-cta-bar" id="mktStickyBar" aria-label="Persistent Call To Action">
          <div class="mkt-sticky-info">
            <strong>Start 14-Day Free Pilot</strong>
            <span>Full hardware & platform access</span>
          </div>
          <button class="mkt-btn-primary mkt-trigger-signup" type="button" style="padding:10px 20px; font-size:14px; height:40px;">
            <span>Get Access</span>
            <span>${Icons.arrowUpRight({ size: 14 })}</span>
          </button>
        </div>

        <!-- EXIT-INTENT MODAL (Fintech Dark, Level 2 Surface #16181a) -->
        <div class="mkt-exit-intent-overlay" id="mktExitOverlay" role="dialog" aria-modal="true" aria-labelledby="exitTitle">
          <div class="mkt-exit-box">
            <button class="mkt-exit-close" id="mktExitCloseBtn" type="button" aria-label="Close offer">×</button>
            <div class="mkt-exit-content-grid">
              <div class="mkt-exit-book-wrap">
                <img src="images/playbook-cover.jpg" alt="Commercial Soil Moisture & Drip Irrigation Playbook" class="mkt-exit-book-img">
              </div>
              <div style="display:flex; flex-direction:column; gap:12px;">
                <div style="color:var(--revo-accent-teal);">${Icons.gift({ size: 32 })}</div>
                <h3 id="exitTitle" style="font-family:var(--revo-font-display); font-size:22px; margin:0;">
                  Before You Go: Free Agronomy Guide
                </h3>
                <p style="font-size:13px; color:var(--revo-on-dark-mute); line-height:1.5; margin:0;">
                  Download the <strong>"Commercial Soil Moisture & Drip Irrigation Playbook (2026 Edition)"</strong> + get priority agronomic survey access.
                </p>
                <form id="mktExitForm" style="display:flex; flex-direction:column; gap:10px; margin-top:4px;">
                  <input type="email" class="mkt-text-input" id="mktExitEmail" placeholder="Enter your work email address" required style="border-color:rgba(255,255,255,0.15); background:#0d0f11; color:#ffffff; height:48px;">
                  <button type="submit" class="mkt-btn-primary" style="justify-content:center; width:100%; height:44px;">
                    <span>Send Me The Free Guide</span>
                    <span>${Icons.arrowUpRight({ size: 14 })}</span>
                  </button>
                </form>
                <div id="mktExitFeedback" style="display:none; font-size:13px; color:var(--revo-accent-teal); font-weight:600;"></div>
              </div>
            </div>
          </div>
        </div>

        <!-- LIVE SOCIAL PROOF TOAST -->
        <div class="mkt-social-toast" id="mktSocialToast" role="status" aria-live="polite">
          <span style="color:var(--revo-accent-teal);">${Icons.sprout({ size: 18 })}</span>
          <div>
            <strong id="mktSocialName" style="display:block; color:#ffffff;">Farmer Joseph (Naivasha)</strong>
            <span id="mktSocialAction" style="display:block; color:var(--revo-on-dark-mute); font-size:12px;">Connected a new soil probe (2 min ago)</span>
          </div>
        </div>

        <!-- FLOATING LIVE AI AGRONOMIST CHATBOT BUTTON -->
        <button class="mkt-chat-floating-btn" id="mktChatFloatingBtn" type="button" aria-label="Ask Shamba AI Agronomist">
          <span>${Icons.sparkles({ size: 16 })}</span>
          <span>Ask AI Agronomist</span>
        </button>

      </div>
    `;
  }

  /**
   * Binds user interactions and CTA click event handlers.
   * @private
   */
  _bindEvents() {
    // 1. Sign In Trigger Buttons
    const openSignIn = () => {
      this._eventBus.publish('MARKETING_CTA_CLICKED', { action: 'open_signin' }, { sourceService: 'MarketingPage' });
      if (this._onOpenSignIn) this._onOpenSignIn();
    };

    this._mountEl.querySelector('#mktNavSignInBtn')?.addEventListener('click', openSignIn);
    this._mountEl.querySelector('#mktHeroSignInBtn')?.addEventListener('click', openSignIn);

    // 2. Platform / Trial Triggers
    const openSignup = () => {
      this._eventBus.publish('MARKETING_CTA_CLICKED', { action: 'start_trial' }, { sourceService: 'MarketingPage' });
      if (this._onLaunchPlatform) this._onLaunchPlatform();
    };

    this._mountEl.querySelector('#mktNavCtaBtn')?.addEventListener('click', openSignup);
    this._mountEl.querySelector('#mktHeroCtaBtn')?.addEventListener('click', openSignup);
    this._mountEl.querySelector('#mktDemoLaunchBtn')?.addEventListener('click', openSignup);
    this._mountEl.querySelectorAll('.mkt-trigger-signup').forEach((btn) => {
      btn.addEventListener('click', openSignup);
    });

    // 3. Mobile Navigation Drawer Toggle (Hypotheses 17 & 24)
    const burgerBtn = this._mountEl.querySelector('#mktBurgerBtn');
    const mobileDrawer = this._mountEl.querySelector('#mktMobileDrawer');
    if (burgerBtn && mobileDrawer) {
      burgerBtn.addEventListener('click', () => {
        const isOpen = mobileDrawer.classList.toggle('open');
        burgerBtn.classList.toggle('active', isOpen);
        burgerBtn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
      });

      mobileDrawer.querySelectorAll('.mkt-drawer-link').forEach((link) => {
        link.addEventListener('click', () => {
          mobileDrawer.classList.remove('open');
          burgerBtn.classList.remove('active');
          burgerBtn.setAttribute('aria-expanded', 'false');
        });
      });

      this._mountEl.querySelector('#mktDrawerCtaBtn')?.addEventListener('click', () => {
        mobileDrawer.classList.remove('open');
        burgerBtn.classList.remove('active');
        burgerBtn.setAttribute('aria-expanded', 'false');
        openSignup();
      });

      this._mountEl.querySelector('#mktDrawerSignInBtn')?.addEventListener('click', () => {
        mobileDrawer.classList.remove('open');
        burgerBtn.classList.remove('active');
        burgerBtn.setAttribute('aria-expanded', 'false');
        openSignIn();
      });
    }

    // 4. FAQ Accordion Toggles (Char 14)
    this._mountEl.querySelectorAll('.mkt-faq-question').forEach((btn) => {
      btn.addEventListener('click', () => {
        const item = btn.closest('.mkt-faq-item');
        if (item) {
          item.classList.toggle('open');
        }
      });
    });

    // 5. Minimal 2-field Lead Capture Form (Char 15, Hyp 3)
    const leadForm = this._mountEl.querySelector('#mktLeadForm');
    leadForm?.addEventListener('submit', (e) => {
      e.preventDefault();
      const name = this._mountEl.querySelector('#mktLeadName')?.value.trim();
      const contact = this._mountEl.querySelector('#mktLeadContact')?.value.trim();
      const fb = this._mountEl.querySelector('#mktLeadFeedback');

      this._logger.info(`Lead submitted: ${name} (${contact})`);
      this._eventBus.publish('LEAD_SUBMITTED', { name, contact }, { sourceService: 'MarketingPage' });

      if (fb) {
        fb.textContent = `Asante sana ${name}! Our agronomy field team has received your request and will contact you within 24 hours.`;
        fb.style.display = 'block';
      }
      leadForm.reset();
    });

    // 6. Exit-Intent Detection (Char 17, Hyp 21)
    const exitOverlay = this._mountEl.querySelector('#mktExitOverlay');
    const exitCloseBtn = this._mountEl.querySelector('#mktExitCloseBtn');
    const exitForm = this._mountEl.querySelector('#mktExitForm');

    document.addEventListener('mouseleave', (e) => {
      if (e.clientY <= 0 && !this._exitIntentShown && this.isVisible()) {
        this._exitIntentShown = true;
        if (exitOverlay) exitOverlay.style.display = 'flex';
        this._eventBus.publish('EXIT_INTENT_SHOWN', {}, { sourceService: 'MarketingPage' });
      }
    });

    exitCloseBtn?.addEventListener('click', () => {
      if (exitOverlay) exitOverlay.style.display = 'none';
    });

    exitOverlay?.addEventListener('click', (e) => {
      if (e.target === exitOverlay) exitOverlay.style.display = 'none';
    });

    exitForm?.addEventListener('submit', (e) => {
      e.preventDefault();
      const email = this._mountEl.querySelector('#mktExitEmail')?.value.trim();
      const exitFb = this._mountEl.querySelector('#mktExitFeedback');
      if (exitFb) {
        exitFb.textContent = `Agronomy Guide dispatched to ${email}!`;
        exitFb.style.display = 'block';
      }
      setTimeout(() => {
        if (exitOverlay) exitOverlay.style.display = 'none';
      }, 2500);
    });

    // 7. Floating AI Agronomist Chat Button (Char 18, Hyp 14)
    this._mountEl.querySelector('#mktChatFloatingBtn')?.addEventListener('click', () => {
      this._eventBus.publish('MARKETING_CTA_CLICKED', { action: 'chat_agronomist' }, { sourceService: 'MarketingPage' });
      openSignup();
    });
  }

  /**
   * Starts background countdown timer and dynamic social proof toasts.
   * @private
   */
  _startTimers() {
    // 1. Urgency Countdown Timer (Hypothesis 26)
    let totalSeconds = 14 * 86400 + 8 * 3600 + 42 * 60 + 19;
    const timerEl = this._mountEl.querySelector('#mktCountdownTimer');

    this._timerInterval = setInterval(() => {
      if (totalSeconds > 0) totalSeconds--;
      const d = Math.floor(totalSeconds / 86400);
      const h = Math.floor((totalSeconds % 86400) / 3600);
      const m = Math.floor((totalSeconds % 3600) / 60);
      const s = totalSeconds % 60;
      if (timerEl) {
        timerEl.textContent = `${d}d : ${String(h).padStart(2, '0')}h : ${String(m).padStart(2, '0')}m : ${String(s).padStart(2, '0')}s`;
      }
    }, 1000);

    // 2. Real-Time Social Proof Toasts (Hypothesis 25)
    const toastEl = this._mountEl.querySelector('#mktSocialToast');
    const nameEl = this._mountEl.querySelector('#mktSocialName');
    const actionEl = this._mountEl.querySelector('#mktSocialAction');

    const socialFeed = [
      { name: 'Mwangi K. (Naivasha)', action: 'Triggered automated drip cycle (-20cm threshold)' },
      { name: 'Faith C. (Molo)', action: 'Installed 2 new frost alert stations' },
      { name: 'David K. (Rongai)', action: 'Connected a solar LoRa gateway (15km range)' },
      { name: 'Simon O. (Nakuru)', action: 'Achieved 42% water savings on wheat block' },
      { name: 'Wanjiku M. (Gilgil)', action: 'Activated AI Agronomist irrigation prescription' }
    ];

    let feedIndex = 0;
    this._socialProofInterval = setInterval(() => {
      if (!this.isVisible() || !toastEl) return;

      const item = socialFeed[feedIndex % socialFeed.length];
      feedIndex++;

      if (nameEl) nameEl.textContent = item.name;
      if (actionEl) actionEl.textContent = item.action;

      toastEl.classList.add('visible');
      setTimeout(() => {
        if (toastEl) toastEl.classList.remove('visible');
      }, 5000);
    }, 14000);

    // Initial toast after 4 seconds
    setTimeout(() => {
      if (this.isVisible() && toastEl) {
        toastEl.classList.add('visible');
        setTimeout(() => {
          if (toastEl) toastEl.classList.remove('visible');
        }, 5000);
      }
    }, 4000);

    // 3. Live Demo Value Shimmer
    setInterval(() => {
      const moistEl = this._mountEl.querySelector('#mktLiveMoistVal');
      if (moistEl && this.isVisible()) {
        const delta = (Math.random() - 0.5) * 0.4;
        this._activeDemoMoisture = Math.max(30, Math.min(45, this._activeDemoMoisture + delta));
        moistEl.textContent = `${this._activeDemoMoisture.toFixed(1)}%`;
      }
    }, 3000);
  }

  /**
   * Cleans up timers and memory.
   */
  dispose() {
    if (this._timerInterval) clearInterval(this._timerInterval);
    if (this._socialProofInterval) clearInterval(this._socialProofInterval);
  }
}
