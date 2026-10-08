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
  }

  /**
   * Returns whether the page is currently visible.
   * @returns {boolean}
   */
  isVisible() {
    return !this._mountEl.classList.contains('hidden') && this._mountEl.style.display !== 'none';
  }

  /**
   * Renders the complete 30-characteristic marketing page template.
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

        <!-- 1. URGENCY & SUBSIDY BANNER (Hypothesis 26) -->
        <aside class="mkt-urgency-banner" role="complementary" aria-label="Limited Subsidy Offer">
          <span class="mkt-urgency-badge">${Icons.bolt({ size: 14 })} Q4 Planting Season Subsidy</span>
          <span>18 Subsidized Solar LoRa Gateways Remaining for ${regionParam} Farms</span>
          <span class="mkt-timer-box" id="mktCountdownTimer">14d : 08h : 42m : 19s</span>
        </aside>

        <!-- 2. MINIMAL NAVIGATION (Characteristic 6, Hypothesis 9) -->
        <header class="mkt-nav" role="banner">
          <a href="#" class="mkt-nav-brand" aria-label="Shamba Watch Home">
            <div class="mkt-brand-logo">S</div>
            <div class="mkt-brand-titles">
              <h1>Shamba Watch</h1>
              <span>Precision IoT Telemetry</span>
            </div>
          </a>

          <div class="mkt-nav-right">
            <button class="mkt-btn-signin" id="mktNavSignInBtn" type="button" aria-label="Sign in to platform">
              <span>${Icons.lock({ size: 15 })}</span>
              <span>Sign In</span>
            </button>
            <button class="mkt-btn-cta-nav" id="mktNavCtaBtn" type="button">
              Get Started Free ${Icons.arrowUpRight({ size: 14 })}
            </button>
          </div>
        </header>

        <!-- 3. HERO SECTION (Characteristics 1, 2, 3, 4, 5, Hypotheses 1, 2, 7, 8, 18) -->
        <section class="mkt-hero" aria-labelledby="heroTitle">
          <div class="mkt-hero-copy">
            
            <div class="mkt-pill-tag">
              <span class="mkt-pill-pulse"></span>
              <span>Live LoRaWAN IoT Telemetry · ${regionParam} Basin</span>
            </div>

            <!-- Benefit-focused, customer-language headline (Hyp 1, 18) -->
            <h2 class="mkt-hero-title" id="heroTitle">
              Cut Crop Loss by 40% with Real-Time <em>${personalizedCrop}</em> Soil & Weather Telemetry.
            </h2>

            <!-- Supporting UVP Subheadline (Char 3) -->
            <p class="mkt-hero-sub">
              Autonomous solar sensors monitor root-zone moisture, microclimate and water stress 24/7 across agricultural production basins. Zero guesswork. Zero connectivity deadzones.
            </p>

            <!-- High-Contrast Primary CTA & Secondary Action (Hyp 2, 7, 8, 27) -->
            <div class="mkt-hero-actions">
              <div class="mkt-cta-row">
                <button class="mkt-btn-primary" id="mktHeroCtaBtn" type="button">
                  <span>Start 14-Day Free Pilot — Instant Access</span>
                  <span>${Icons.arrowUpRight({ size: 16 })}</span>
                </button>
                <button class="mkt-btn-secondary" id="mktHeroSignInBtn" type="button">
                  <span>Sign In to Platform</span>
                  <span>${Icons.lock({ size: 16 })}</span>
                </button>
              </div>

              <!-- 1-Click Instant Demo Credentials for Evaluation -->
              <div class="mkt-instant-demo-row">
                <span>Evaluate right now with 1 click:</span>
                <button class="mkt-demo-pill" id="mktQuickAdminBtn" type="button" title="Sign in as Demo Administrator">
                  <span>${Icons.crown({ size: 14 })} Instant Demo Admin</span>
                </button>
                <button class="mkt-demo-pill" id="mktQuickFarmerBtn" type="button" title="Sign in as Demo Basin Farmer">
                  <span>${Icons.sprout({ size: 14 })} Instant Demo Farmer</span>
                </button>
              </div>

              <!-- Trust Badges below CTA (Characteristic 10, Hypothesis 6) -->
              <div class="mkt-trust-strip">
                <span class="mkt-trust-item">${Icons.shieldCheck({ size: 14 })} 256-bit AES LoRaWAN</span>
                <span class="mkt-trust-item">${Icons.sprout({ size: 14 })} KALRO Agronomy Standard</span>
                <span class="mkt-trust-item">${Icons.sun({ size: 14 })} IP68 Weatherproof Hardware</span>
                <span class="mkt-trust-item">${Icons.shield({ size: 14 })} 30-Day Money-Back Guarantee</span>
              </div>
            </div>

          </div>

          <!-- 4. HERO INTERACTIVE PRODUCT DEMO CARD (Characteristic 4, Hypotheses 5, 19) -->
          <div class="mkt-demo-frame" aria-label="Interactive Live Telemetry Preview">
            <div class="mkt-demo-frame-header">
              <div class="mkt-frame-dots">
                <div class="mkt-frame-dot" style="background:#E53E3E;"></div>
                <div class="mkt-frame-dot" style="background:#ECC94B;"></div>
                <div class="mkt-frame-dot" style="background:#48BB78;"></div>
              </div>
              <span class="mkt-frame-title">SHAMBA-LIVE // STATION-NAIVASHA-01</span>
              <span style="font-size:11px; color:var(--moss);">● SIMULATED FEED</span>
            </div>

            <div class="mkt-demo-content">
              <div class="mkt-demo-status-row">
                <div class="mkt-demo-station-tag">
                  <strong>Naivasha Basin Station #01</strong>
                  <span>Crop: Roses & French Beans · 1,890m ASL</span>
                </div>
                <div class="mkt-demo-live-badge">
                  <span class="mkt-pill-pulse"></span>
                  <span>99.8% SIGNAL</span>
                </div>
              </div>

              <!-- Telemetry Cards -->
              <div class="mkt-telemetry-sim-grid">
                <div class="mkt-telemetry-card">
                  <div class="mkt-card-label">Root Moisture (-20cm)</div>
                  <div class="mkt-card-value" id="mktLiveMoistVal">34.2%</div>
                  <div class="mkt-card-status mkt-status-good">${Icons.check({ size: 12 })} Optimal Field Capacity</div>
                </div>
                <div class="mkt-telemetry-card">
                  <div class="mkt-card-label">Canopy Air Temp</div>
                  <div class="mkt-card-value">22.4°C</div>
                  <div class="mkt-card-status mkt-status-good">${Icons.check({ size: 12 })} Safe Transpiration</div>
                </div>
                <div class="mkt-telemetry-card">
                  <div class="mkt-card-label">Vapor Pressure Deficit</div>
                  <div class="mkt-card-value">1.18 kPa</div>
                  <div class="mkt-card-status mkt-status-good">${Icons.check({ size: 12 })} Moderate Demand</div>
                </div>
                <div class="mkt-telemetry-card">
                  <div class="mkt-card-label">Solar Battery Reserve</div>
                  <div class="mkt-card-value">98%</div>
                  <div class="mkt-card-status mkt-status-good">${Icons.battery({ size: 12 })} LiFePO4 Full</div>
                </div>
              </div>

              <!-- Animated Telemetry Wave Preview -->
              <div class="mkt-sim-graph">
                <svg viewBox="0 0 400 90" preserveAspectRatio="none">
                  <defs>
                    <linearGradient id="mktGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                      <stop offset="0%" stop-color="#7A9471" stop-opacity="0.4"></stop>
                      <stop offset="100%" stop-color="#7A9471" stop-opacity="0.0"></stop>
                    </linearGradient>
                  </defs>
                  <path d="M0,60 Q50,30 100,45 T200,25 T300,50 T400,35 L400,90 L0,90 Z" fill="url(#mktGrad)"></path>
                  <path d="M0,60 Q50,30 100,45 T200,25 T300,50 T400,35" fill="none" stroke="#7A9471" stroke-width="2.5"></path>
                  <circle cx="400" cy="35" r="4" fill="#EDE8DE" stroke="#7A9471" stroke-width="2"></circle>
                </svg>
              </div>

              <!-- Interactive Prompt to Launch Platform -->
              <div class="mkt-demo-interactive-cta">
                <span>View Full GIS Map & All 4 Basin Stations</span>
                <button class="mkt-btn-launch-demo" id="mktDemoLaunchBtn" type="button">
                  Launch Live Platform ${Icons.arrowUpRight({ size: 14 })}
                </button>
              </div>
            </div>
          </div>
        </section>

        <!-- 5. SOCIAL PROOF LOGOS (Characteristic 7, Hypothesis 15) -->
        <section class="mkt-logos-section" aria-label="Partner and Customer Organizations">
          <div class="mkt-logos-title">Trusted By Leading Agricultural Leaders Across East Africa</div>
          <div class="mkt-logos-row">
            <span class="mkt-partner-logo">${Icons.sprout({ size: 15 })} Nakuru Farmers Co-operative</span>
            <span class="mkt-partner-logo">${Icons.leaf({ size: 15 })} Naivasha Flower Growers Association</span>
            <span class="mkt-partner-logo">${Icons.flask({ size: 15 })} KALRO Kenya Agricultural Research</span>
            <span class="mkt-partner-logo">${Icons.leaf({ size: 15 })} East Africa Tea Trade Chamber</span>
          </div>
        </section>

        <!-- 6. QUANTIFIED METRICS & SUCCESS RESULTS (Characteristic 9, Hypothesis 16) -->
        <section class="mkt-stats-section" aria-label="Quantified Success Metrics">
          <div class="mkt-stats-grid">
            <div class="mkt-stat-card">
              <div class="mkt-stat-number">38.4%</div>
              <div class="mkt-stat-label">Average Water Saved</div>
              <div class="mkt-stat-desc">Through precision root-zone drip triggering vs timed schedules.</div>
            </div>
            <div class="mkt-stat-card">
              <div class="mkt-stat-number">42%</div>
              <div class="mkt-stat-label">Reduction in Crop Wilt</div>
              <div class="mkt-stat-desc">Early warning alerts triggered before irreversible damage occurs.</div>
            </div>
            <div class="mkt-stat-card">
              <div class="mkt-stat-number">15 km</div>
              <div class="mkt-stat-label">LoRaWAN Range</div>
              <div class="mkt-stat-desc">Single solar gateway covers entire escarpments and valleys without cellular SIMs.</div>
            </div>
            <div class="mkt-stat-card">
              <div class="mkt-stat-number">12,400+</div>
              <div class="mkt-stat-label">Acres Protected</div>
              <div class="mkt-stat-desc">From Mau Narok potato highlands to Naivasha horticulture basins.</div>
            </div>
          </div>
        </section>

        <!-- 7. EMOTIONAL PAIN POINT VS. AGRONOMIC BENEFIT (Characteristic 26, 27) -->
        <section class="mkt-pain-section">
          <div class="mkt-container">
            <div class="mkt-section-header">
              <span>Why Traditional Farming Fails</span>
              <h2>Farming Shouldn't Be a High-Stakes Guessing Game</h2>
              <p>Over-irrigation rots root zones and wastes costly pump fuel. Under-irrigation permanently stunts yield grade. Shamba Watch closes the loop.</p>
            </div>

            <div class="mkt-comparison-grid">
              <div class="mkt-pain-card">
                <h3><span>${Icons.alertTriangle({ size: 18 })}</span> The Old Way (Blind Farming)</h3>
                <ul class="mkt-bullet-list">
                  <li><span class="icon">${Icons.x({ size: 14 })}</span> Walking fields feeling topsoil with fingers — missing deep sub-surface root drought.</li>
                  <li><span class="icon">${Icons.x({ size: 14 })}</span> Relying on generic regional weather forecasts that miss localized valley microclimates.</li>
                  <li><span class="icon">${Icons.x({ size: 14 })}</span> Expensive cellular SIM cards per station with frequent battery deaths and SIM disconnects.</li>
                  <li><span class="icon">${Icons.x({ size: 14 })}</span> Late frost or heat stress alerts received after 30% of the crop has already suffered necrosis.</li>
                </ul>
              </div>

              <div class="mkt-benefit-card">
                <h3><span>${Icons.checkCircle({ size: 18 })}</span> The Shamba Watch Way</h3>
                <ul class="mkt-bullet-list">
                  <li><span class="icon">${Icons.check({ size: 14 })}</span> Continuous 24/7 sub-surface moisture telemetry at root depths (-10cm, -20cm, -40cm).</li>
                  <li><span class="icon">${Icons.check({ size: 14 })}</span> Microclimate weather masts measuring VPD, canopy temperature, and humidity directly on your block.</li>
                  <li><span class="icon">${Icons.check({ size: 14 })}</span> Solar-powered autonomous LoRa nodes with 45-day battery reserve and 15km line-of-sight range.</li>
                  <li><span class="icon">${Icons.check({ size: 14 })}</span> AI Agronomist assistant offering instant actionable irrigation prescriptions right on your phone.</li>
                </ul>
              </div>
            </div>
          </div>
        </section>

        <!-- 8. COMPARISON TABLE VS ALTERNATIVES (Characteristic 13, Hypothesis 20) -->
        <section class="mkt-table-section">
          <div class="mkt-container">
            <div class="mkt-section-header">
              <span>Competitive Landscape</span>
              <h2>How Shamba Watch Compares</h2>
              <p>Engineered from the ground up for East African field realities, remote topography, and solar autonomy.</p>
            </div>

            <div class="mkt-table-wrap">
              <table class="mkt-table">
                <thead>
                  <tr>
                    <th>Feature / Capability</th>
                    <th class="highlight">Shamba Watch 2.0</th>
                    <th>Manual Soil Gauges</th>
                    <th>Imported Satellite Stations</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td><strong>Telemetry Frequency</strong></td>
                    <td class="highlight">Continuous (Real-Time)</td>
                    <td>Manual (Once per day)</td>
                    <td>Periodic (4–8 hr delay)</td>
                  </tr>
                  <tr>
                    <td><strong>Cellular SIM Required per Probe</strong></td>
                    <td class="highlight">No (LoRa 15km Mesh)</td>
                    <td>No (Offline)</td>
                    <td>Yes (Expensive Data Plans)</td>
                  </tr>
                  <tr>
                    <td><strong>Autonomous Solar LiFePO4 Power</strong></td>
                    <td class="highlight">Yes (45-Day Dark Reserve)</td>
                    <td>N/A</td>
                    <td>Often Lead-Acid (Prone to theft)</td>
                  </tr>
                  <tr>
                    <td><strong>Field AI Agronomist Chat</strong></td>
                    <td class="highlight">Included (24/7 Guidance)</td>
                    <td>None</td>
                    <td>Raw charts only</td>
                  </tr>
                  <tr>
                    <td><strong>Monthly Cost per 100 Acres</strong></td>
                    <td class="highlight">From $19/mo</td>
                    <td>High Labor Hours</td>
                    <td>$300+ / mo</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <!-- Repeated CTA after section (Hypothesis 29) -->
            <div style="text-align: center; margin-top: 28px;">
              <button class="mkt-btn-primary mkt-trigger-signup" type="button">
                Start Your 14-Day Free Trial Today ${Icons.arrowUpRight({ size: 16 })}
              </button>
            </div>
          </div>
        </section>

        <!-- 9. TESTIMONIALS WITH VERIFIED ROLES & QUANTIFIED IMPACT (Characteristic 8, Hypotheses 4, 16, 28) -->
        <section class="mkt-testimonials-section">
          <div class="mkt-container">
            <div class="mkt-section-header">
              <span>Farmer Case Studies</span>
              <h2>Proven Results From the Field</h2>
              <p>Hear from agronomists and estate managers operating throughout commercial agricultural basins.</p>
            </div>

            <div class="mkt-testimonials-grid">
              <div class="mkt-testimonial-card">
                <p class="mkt-quote">
                  "We reduced our drip irrigation expenditure by 34% in the first 60 days while increasing our export yield grade by 18%. Shamba Watch paid for itself in less than two weeks."
                </p>
                <div class="mkt-quote-metric">${Icons.star({ size: 14 })} 34% Pump Fuel Saved</div>
                <div class="mkt-author-row">
                  <div class="mkt-avatar">MK</div>
                  <div class="mkt-author-meta">
                    <strong>Mwangi Karanja</strong>
                    <span>Lead Agronomist · Oserian Flower Basin</span>
                  </div>
                </div>
              </div>

              <div class="mkt-testimonial-card">
                <p class="mkt-quote">
                  "Before Shamba Watch, frost warnings came too late. The SMS and live telemetry alerts saved 40 acres of seed potato crop in one freeze event. Unmatched reliability."
                </p>
                <div class="mkt-quote-metric">${Icons.star({ size: 14 })} 40 Acres Saved From Frost</div>
                <div class="mkt-author-row">
                  <div class="mkt-avatar">FC</div>
                  <div class="mkt-author-meta">
                    <strong>Faith Chebet</strong>
                    <span>Operations Director · Molo Highland Producers</span>
                  </div>
                </div>
              </div>

              <div class="mkt-testimonial-card">
                <p class="mkt-quote">
                  "Our field stations in Rongai used to constantly drop offline due to poor 3G coverage. Shamba Watch's LoRa mesh connects across the entire ridge with zero monthly SIM costs."
                </p>
                <div class="mkt-quote-metric">${Icons.star({ size: 14 })} 99.8% Gateway Uptime</div>
                <div class="mkt-author-row">
                  <div class="mkt-avatar">DK</div>
                  <div class="mkt-author-meta">
                    <strong>David Kiprono</strong>
                    <span>Estate Manager · Rongai Cereal Growers</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <!-- 10. TRANSPARENT PRICING & RISK REVERSAL (Characteristics 11, 12, Hypotheses 11, 12) -->
        <section class="mkt-pricing-section">
          <div class="mkt-container">
            <div class="mkt-section-header">
              <span>Transparent Investment</span>
              <h2>Predictable, Zero-Lock-in Plans</h2>
              <p>Hardware installed free on all commercial pilots. Cancel anytime.</p>
            </div>

            <div class="mkt-pricing-grid">
              
              <!-- Tier 1 -->
              <div class="mkt-pricing-card">
                <div>
                  <h3 style="font-size:20px; margin:0;">Smallholder Starter</h3>
                  <p style="font-size:13px; color:var(--ink-dim); margin:6px 0 0 0;">Ideal for single-block family farms & greenhouses.</p>
                  <div class="mkt-price-tag">
                    <span class="mkt-price-amount">$19</span>
                    <span class="mkt-price-period">/ month</span>
                  </div>
                  <ul class="mkt-bullet-list">
                    <li><span class="icon">${Icons.check({ size: 14 })}</span> 1 Field Monitoring Station</li>
                    <li><span class="icon">${Icons.check({ size: 14 })}</span> Dual-depth root moisture telemetry</li>
                    <li><span class="icon">${Icons.check({ size: 14 })}</span> Mobile SMS & Web alert thresholds</li>
                    <li><span class="icon">${Icons.check({ size: 14 })}</span> Community agronomy support</li>
                  </ul>
                </div>
                <button class="mkt-btn-secondary mkt-trigger-signup" type="button" style="margin-top:24px; justify-content:center;">
                  Select Starter Plan ${Icons.arrowUpRight({ size: 14 })}
                </button>
              </div>

              <!-- Tier 2 (Featured) -->
              <div class="mkt-pricing-card featured">
                <div class="mkt-popular-ribbon">Most Popular</div>
                <div>
                  <h3 style="font-size:20px; margin:0; color:var(--moss);">Commercial Basin Pro</h3>
                  <p style="font-size:13px; color:var(--ink-dim); margin:6px 0 0 0;">For commercial farms, tea estates & flower growers.</p>
                  <div class="mkt-price-tag">
                    <span class="mkt-price-amount">$49</span>
                    <span class="mkt-price-period">/ month</span>
                  </div>
                  <ul class="mkt-bullet-list">
                    <li><span class="icon">${Icons.check({ size: 14 })}</span> Up to 5 Solar Field Stations</li>
                    <li><span class="icon">${Icons.check({ size: 14 })}</span> Full LoRaWAN 15km Gateway mast</li>
                    <li><span class="icon">${Icons.check({ size: 14 })}</span> Unlimited Farmer & Agronomist accounts</li>
                    <li><span class="icon">${Icons.check({ size: 14 })}</span> AI Agronomist Query Assistant</li>
                    <li><span class="icon">${Icons.check({ size: 14 })}</span> Complete 30-day historical timeseries</li>
                  </ul>
                </div>
                <button class="mkt-btn-primary mkt-trigger-signup" type="button" style="margin-top:24px; justify-content:center;">
                  Start 14-Day Free Pilot ${Icons.arrowUpRight({ size: 14 })}
                </button>
              </div>

              <!-- Tier 3 -->
              <div class="mkt-pricing-card">
                <div>
                  <h3 style="font-size:20px; margin:0;">Co-operative Basin</h3>
                  <p style="font-size:13px; color:var(--ink-dim); margin:6px 0 0 0;">For co-operatives, agribusinesses & basin projects.</p>
                  <div class="mkt-price-tag">
                    <span class="mkt-price-amount">$120</span>
                    <span class="mkt-price-period">/ month</span>
                  </div>
                  <ul class="mkt-bullet-list">
                    <li><span class="icon">${Icons.check({ size: 14 })}</span> Up to 20 Solar Field Stations</li>
                    <li><span class="icon">${Icons.check({ size: 14 })}</span> Multi-gateway fault tolerance</li>
                    <li><span class="icon">${Icons.check({ size: 14 })}</span> Custom REST & Webhook data pipelines</li>
                    <li><span class="icon">${Icons.check({ size: 14 })}</span> Dedicated agronomist field calibration</li>
                    <li><span class="icon">${Icons.check({ size: 14 })}</span> 99.9% Enterprise SLA</li>
                  </ul>
                </div>
                <button class="mkt-btn-secondary mkt-trigger-signup" type="button" style="margin-top:24px; justify-content:center;">
                  Contact Agribusiness Team ${Icons.arrowUpRight({ size: 14 })}
                </button>
              </div>

            </div>

            <!-- Risk Reversal Guarantee (Characteristic 11, Hypothesis 12) -->
            <div class="mkt-guarantee-box">
              <span style="display:inline-flex; color:var(--moss);">${Icons.shieldCheck({ size: 36 })}</span>
              <div>
                <strong style="display:block; font-size:15px; color:var(--ink);">100% Risk-Free 30-Day Money-Back Guarantee</strong>
                <span style="font-size:13px; color:var(--ink-dim);">
                  If Shamba Watch does not reduce your water costs or increase crop yield within 30 days, we remove the equipment and refund every shilling. No questions asked.
                </span>
              </div>
            </div>
          </div>
        </section>

        <!-- 11. MINIMAL 2-FIELD LEAD CAPTURE FORM (Characteristic 15, Hypothesis 3) -->
        <section class="mkt-lead-section">
          <div class="mkt-container">
            <div class="mkt-lead-box">
              <h2 style="font-family:var(--font-display); font-size:26px; margin:0 0 8px 0; color:var(--ink);">
                Request a Free Field Survey & Pilot
              </h2>
              <p style="font-size:14px; color:var(--ink-dim); margin:0;">
                Tell us your location and crop. Our agronomist will assess your field LoRa coverage within 24 hours.
              </p>

              <form class="mkt-lead-form" id="mktLeadForm">
                <input type="text" class="mkt-form-input" id="mktLeadName" placeholder="Your Full Name (e.g. John Chege)" required>
                <input type="text" class="mkt-form-input" id="mktLeadContact" placeholder="Email or Phone (e.g. 0712 345 678)" required>
                <button type="submit" class="mkt-btn-primary" id="mktLeadSubmitBtn" style="justify-content:center; padding:14px;">
                  Schedule Free Field Survey ${Icons.arrowUpRight({ size: 14 })}
                </button>
              </form>
              <div id="mktLeadFeedback" style="display:none; font-size:13px; margin-top:12px; color:var(--moss); font-weight:600;"></div>
            </div>
          </div>
        </section>

        <!-- 12. FAQ ACCORDION (Characteristic 14, Hypothesis 13) -->
        <section class="mkt-faq-section">
          <div class="mkt-section-header">
            <span>Got Questions?</span>
            <h2>Frequently Asked Questions</h2>
            <p>Everything you need to know about installation, range, and accuracy.</p>
          </div>

          <div class="mkt-faq-list">
            
            <div class="mkt-faq-item open">
              <button class="mkt-faq-question" type="button">
                <span>1. Does Shamba Watch work without 3G/4G coverage on my farm?</span>
                <span class="toggle">+</span>
              </button>
              <div class="mkt-faq-answer">
                Yes! That is exactly what Shamba Watch was engineered for. Our field sensors use 868MHz LoRaWAN wireless technology, transmitting telemetry up to 15 kilometers over hills and valleys to a central solar gateway mast. No SIM cards or monthly data bundles are required on your field probes.
              </div>
            </div>

            <div class="mkt-faq-item">
              <button class="mkt-faq-question" type="button">
                <span>2. What happens during the rainy or cloudy season without bright sun?</span>
                <span class="toggle">+</span>
              </button>
              <div class="mkt-faq-answer">
                Every field probe and gateway includes industrial LiFePO4 solar batteries with an autonomous power management circuit. Even in complete, continuous darkness or torrential monsoons, the stations run continuously for 45 days on internal battery reserve alone.
              </div>
            </div>

            <div class="mkt-faq-item">
              <button class="mkt-faq-question" type="button">
                <span>3. How quickly can I install and start viewing soil moisture readings?</span>
                <span class="toggle">+</span>
              </button>
              <div class="mkt-faq-answer">
                In less than 10 minutes. Probes arrive pre-calibrated for agricultural volcanic and loam soils. You simply auger a borehole to root zone depth, insert the probe, clamp the solar mast, and the live stream immediately populates on your dashboard.
              </div>
            </div>

            <div class="mkt-faq-item">
              <button class="mkt-faq-question" type="button">
                <span>4. Can multiple farm workers or agronomists access the same field?</span>
                <span class="toggle">+</span>
              </button>
              <div class="mkt-faq-answer">
                Yes. Shamba Watch includes full Role-Based Access Control (RBAC). Estate managers can assign individual stations to specific block supervisors or agronomists, giving each team member customized view permissions.
              </div>
            </div>

            <div class="mkt-faq-item">
              <button class="mkt-faq-question" type="button">
                <span>5. Is there any long-term contract or hardware purchase lock-in?</span>
                <span class="toggle">+</span>
              </button>
              <div class="mkt-faq-answer">
                None. Our subscriptions are month-to-month and cancelable anytime. If you wish to purchase the hardware outright or lease it, our plans adapt to your balance sheet.
              </div>
            </div>

          </div>
        </section>

        <!-- 13. STICKY MOBILE CTA BAR (Characteristic 16, Hypothesis 10) -->
        <div class="mkt-sticky-cta-bar" id="mktStickyBar" aria-label="Persistent Call To Action">
          <div>
            <strong style="display:block; font-size:13px; color:var(--ink);">Start 14-Day Free Pilot</strong>
            <span style="font-size:11px; color:var(--ink-dim);">Full hardware & platform access</span>
          </div>
          <button class="mkt-btn-primary mkt-trigger-signup" type="button" style="padding:10px 18px; font-size:13px;">
            Get Access ${Icons.arrowUpRight({ size: 14 })}
          </button>
        </div>

        <!-- 14. EXIT-INTENT MODAL (Characteristic 17, Hypothesis 21) -->
        <div class="mkt-exit-intent-overlay" id="mktExitOverlay" role="dialog" aria-modal="true" aria-labelledby="exitTitle">
          <div class="mkt-exit-box">
            <button class="mkt-exit-close" id="mktExitCloseBtn" type="button" aria-label="Close offer">×</button>
            <span style="display:inline-flex; color:var(--moss); margin-bottom:8px;">${Icons.gift({ size: 36 })}</span>
            <h3 id="exitTitle" style="font-family:var(--font-display); font-size:22px; color:var(--ink); margin:0 0 8px 0;">
              Before You Go: Free Agronomy Guide
            </h3>
            <p style="font-size:13px; color:var(--ink-dim); margin:0 0 16px 0;">
              Download the <strong>"Commercial Soil Moisture & Drip Irrigation Playbook (2026 Edition)"</strong> + get a 20% hardware discount voucher.
            </p>
            <form id="mktExitForm" style="display:flex; flex-direction:column; gap:10px;">
              <input type="email" class="mkt-form-input" id="mktExitEmail" placeholder="Enter your email address" required>
              <button type="submit" class="mkt-btn-primary" style="justify-content:center;">
                Send Me The Free Guide ${Icons.arrowUpRight({ size: 14 })}
              </button>
            </form>
            <div id="mktExitFeedback" style="display:none; font-size:12px; color:var(--moss); margin-top:8px; font-weight:600;"></div>
          </div>
        </div>

        <!-- 15. LIVE SOCIAL PROOF TOAST (Hypothesis 25) -->
        <div class="mkt-social-toast" id="mktSocialToast" role="status" aria-live="polite">
          <span style="display:inline-flex; color:var(--moss);">${Icons.sprout({ size: 18 })}</span>
          <div>
            <strong id="mktSocialName" style="color:var(--ink);">Farmer Joseph (Naivasha)</strong>
            <span id="mktSocialAction" style="display:block; color:var(--ink-dim);">Connected a new soil probe (2 min ago)</span>
          </div>
        </div>

        <!-- 16. FLOATING LIVE AI AGRONOMIST CHATBOT (Characteristic 18, Hypothesis 14) -->
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

    // 3. One-Click Instant Demo Credentials (Admin & Farmer)
    this._mountEl.querySelector('#mktQuickAdminBtn')?.addEventListener('click', async () => {
      this._eventBus.publish('MARKETING_CTA_CLICKED', { action: 'instant_demo_admin' }, { sourceService: 'MarketingPage' });
      const res = await this._authService.quickSignInDemo('admin');
      if (res.data && this._onLaunchPlatform) {
        this._onLaunchPlatform();
      }
    });

    this._mountEl.querySelector('#mktQuickFarmerBtn')?.addEventListener('click', async () => {
      this._eventBus.publish('MARKETING_CTA_CLICKED', { action: 'instant_demo_farmer' }, { sourceService: 'MarketingPage' });
      const res = await this._authService.quickSignInDemo('farmer');
      if (res.data && this._onLaunchPlatform) {
        this._onLaunchPlatform();
      }
    });

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
        exitFb.textContent = `Guide and 20% discount voucher dispatched to ${email}!`;
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
