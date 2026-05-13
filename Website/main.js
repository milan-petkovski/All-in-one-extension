import { updateData } from './updates.js';

// Expose functions to window for HTML event handlers (onclick)
window.toggleLanguage = toggleLanguage;
window.applyLanguage = applyLanguage;

// Globalni objekat za prevode
window.currentTranslations = {};

/**
 * Primenjuje izabrani jezik na celu stranicu
 */
async function applyLanguage(lang) {
    localStorage.setItem("lang", lang);
    document.documentElement.lang = lang === 'sr' ? 'sr_RS' : 'en';

    try {
        const response = await fetch(`${lang}.json`);
        if (!response.ok) throw new Error("Neuspešno učitavanje JSON-a");
        
        const translations = await response.json();
        window.currentTranslations = translations;

        // Osnovni prevodi elemenata (tekst unutar tagova)
        document.querySelectorAll("[data-i18n]").forEach(el => {
            const key = el.getAttribute("data-i18n");
            if (translations[key]) {
                if (el.tagName === "META") {
                    el.setAttribute("content", translations[key]);
                } else if (el.tagName === "TITLE") {
                    document.title = translations[key];
                } else {
                    el.innerHTML = translations[key];
                }
            }
        });

        // Placeholder prevodi za inpute i textarea
        document.querySelectorAll('[data-i18n-placeholder]').forEach(element => {
            const key = element.getAttribute('data-i18n-placeholder');
            if (translations[key]) {
                element.setAttribute('placeholder', translations[key]);
            }
        });

        // Prevodi za linkove (href)
        document.querySelectorAll('[data-i18n-href]').forEach(element => {
            const key = element.getAttribute('data-i18n-href');
            if (translations[key]) {
                element.setAttribute('href', translations[key]);
            }
        });

        // Update teksta na toggle dugmetu (prikazuje suprotan jezik od trenutnog)
        const langText = document.getElementById("lang-text");
        if (langText) {
            langText.textContent = lang === "sr" ? "EN" : "SR";
        }

        // Lokalizacija datuma
        const options = { day: 'numeric', month: 'long', year: 'numeric' };
        const locale = lang === 'sr' ? 'sr-Latn-RS' : 'en-US';
        const danas = new Date().toLocaleString(locale, options);
        document.querySelectorAll('.trenutni-datum').forEach(el => {
            el.textContent = danas;
        });

        // Ako postoji kontejner za ažuriranja, ponovo ga iscrtaj
        if (document.getElementById('update-container')) {
            renderUpdates(lang);
        }

        // Ponovna inicijalizacija Lucide ikonica (obavezno jer innerHTML briše SVG)
        if (typeof lucide !== 'undefined') lucide.createIcons();

        // Javljamo ostalim skriptama da je jezik učitan
        window.dispatchEvent(new CustomEvent('languageLoaded', { detail: lang }));

    } catch (error) {
        console.error('Greška pri učitavanju prevoda:', error);
    }
}

/**
 * Menja jezik između SR i EN (Toggle)
 */
function toggleLanguage() {
    const currentLang = localStorage.getItem("lang") || "en";
    const newLang = currentLang === "sr" ? "en" : "sr";
    applyLanguage(newLang);
}

/**
 * Dinamičko iscrtavanje liste ažuriranja
 */
function renderUpdates(lang) {
    const container = document.getElementById('update-container');
    if (!container || typeof updateData === 'undefined') return;

    container.innerHTML = '';
    let prosaoAktivni = false;
    
    updateData.forEach((item) => {
        const isAktivno = item.aktivno === true;
        if (isAktivno) prosaoAktivni = true;

        const isIspod = !isAktivno && prosaoAktivni;
        const card = document.createElement('div');
        card.className = `relative flex flex-col md:flex-row items-center mb-24 ${isIspod ? "group opacity-60 hover:opacity-100 transition-all duration-500" : "group"}`;

        card.innerHTML = `
            <div class="absolute left-6 md:left-1/2 w-6 h-6 rounded-full -translate-x-1/2 z-20 ${isAktivno ? 'bg-darkpanel border-4 border-brand shadow-[0_0_20px_#00ff88]' : 'bg-gray-200 border-4 border-white'}"></div>
            
            <div class="w-full md:w-1/2 md:pr-16 md:text-right pl-16 md:pl-0 flex flex-col md:items-end mt-2">
                ${isAktivno ? `<span class="bg-brand/10 text-brand font-black text-[10px] px-3 py-1 rounded-full uppercase tracking-[0.2em] border border-brand/20">${window.currentTranslations['upd_dyn_active'] || 'Active'}</span>` : ''}
                <div class="relative inline-block mt-4">
                    <h3 class="text-6xl md:text-7xl font-black text-darkpanel tracking-tighter leading-none transition-transform duration-500 group-hover:scale-105 md:origin-right origin-left">
                        <span class="text-gray-300 text-4xl md:text-5xl mr-1 font-bold">v</span>${item.verzija}
                    </h3>
                </div>
                <div class="flex items-center gap-4 mt-4 opacity-60 group-hover:opacity-100 transition-opacity duration-500">
                    <div class="h-px w-12 bg-gradient-to-r from-transparent to-gray-400 hidden md:block"></div>
                    <p class="text-gray-500 font-extrabold text-[11px] uppercase tracking-[0.3em]">${item[lang].datum}</p>
                </div>
            </div>

            <div class="w-full md:w-1/2 md:pl-16 pl-16 mt-6 md:mt-0 transition-all duration-500 hover:translate-x-1">
                <div class="bg-[#1e1e24] p-9 rounded-[3rem] shadow-[0_20px_50px_rgba(0,0,0,0.2)] border border-white/5 relative overflow-hidden group-hover:border-brand/40 transition-all duration-500">
                    <div class="relative z-10 text-left">
                        <div class="flex items-center gap-3 mb-6">
                            <div class="w-10 h-10 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center shadow-inner">
                                <i data-lucide="${isAktivno ? 'zap' : 'package'}" class="w-5 h-5 ${isAktivno ? 'text-brand' : 'text-gray-500'}"></i>
                            </div>
                            <div>
                                <h4 class="text-white font-black text-lg uppercase tracking-tight italic leading-tight">${item[lang].naslov}</h4>
                                <p class="text-brand text-[9px] font-black uppercase tracking-widest opacity-80">${window.currentTranslations['upd_dyn_stable'] || 'Stable Release'}</p>
                            </div>
                        </div>
                        <div class="bg-white/5 rounded-[1.5rem] p-5 border border-white/5 shadow-inner">
                            <p class="text-gray-300 leading-relaxed font-medium text-[14px]">${item[lang].opis}</p>
                        </div>
                        <div class="mt-6 flex items-center justify-between">
                            <div class="flex items-center gap-2 text-gray-500">
                                <span class="w-1.5 h-1.5 rounded-full bg-brand animate-pulse"></span>
                                <span class="text-[9px] font-black uppercase tracking-widest italic">${window.currentTranslations['upd_dyn_system'] || 'All In One System'}</span>
                            </div>
                            <i data-lucide="shield-check" class="w-4 h-4 text-gray-600 group-hover:text-brand transition-colors"></i>
                        </div>
                    </div>
                </div>
            </div>`;
        container.appendChild(card);
    });
    if (typeof lucide !== 'undefined') lucide.createIcons();
}

/**
 * PAMETNA DETEKCIJA POČETNOG JEZIKA
 */
async function detectInitialLanguage() {
    // 1. Proveri da li korisnik već ima sačuvan izbor u browseru
    const saved = localStorage.getItem("lang");
    if (saved) return saved;

    // 2. Proveri državu preko IP adrese
    try {
        const response = await fetch('https://ipapi.co/json/');
        if (response.ok) {
            const data = await response.json();
            const country = data.country_code;

            // Lista EX-YU država za koje forsiramo srpski/regionalni prevod
            const balkanCountries = ['RS', 'BA', 'HR', 'ME', 'MK']; 
            
            if (balkanCountries.includes(country)) {
                return 'sr';
            }
        }
    } catch (e) {
        console.warn("IP detekcija nije dostupna, prelazim na podešavanja browsera.");
    }

    // 3. Zadnja opcija: Jezik browsera (ako je browser na srpskom, stavi srpski, inače engleski)
    return navigator.language.startsWith("sr") ? "sr" : "en";
}

/**
 * GLAVNA INICIJALIZACIJA
 */
document.addEventListener('DOMContentLoaded', async () => {
    // Odredi jezik i primeni ga
    const langToUse = await detectInitialLanguage();
    applyLanguage(langToUse);

    // Inicijalizuj ikonice
    if (typeof lucide !== 'undefined') lucide.createIcons();

    // Verzija u navigaciji
    const latestVersionLink = document.querySelector('[data-latest-version]');
    if (latestVersionLink && typeof updateData !== 'undefined' && updateData.length) {
        const latestUpdate = updateData.find(item => item.aktivno) || updateData[0];
        const normalizedVersion = String(latestUpdate.verzija).replace(/^v/i, '');
        latestVersionLink.textContent = `v${normalizedVersion}`;
    }

    // Detekcija mobilnih uređaja
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || window.innerWidth <= 768;
    const mobileBlocker = document.getElementById('mobile-blocker');
    if (isMobile && mobileBlocker) {
        mobileBlocker.classList.remove('hidden');
        mobileBlocker.classList.add('flex');
    }

    // Scroll Progress & Back to Top
    const backToTop = document.getElementById('backToTop');
    const progressRing = document.getElementById('progressRing');

    if (progressRing && backToTop) {
        const radius = progressRing.r.baseVal.value;
        const circumference = radius * 2 * Math.PI;

        progressRing.style.strokeDasharray = `${circumference} ${circumference}`;
        progressRing.style.strokeDashoffset = circumference;

        window.addEventListener('scroll', () => {
            const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
            const scrollHeight = document.documentElement.scrollHeight - window.innerHeight;
            const scrollPercent = scrollHeight > 0 ? (scrollTop / scrollHeight) : 0;

            progressRing.style.strokeDashoffset = circumference - (scrollPercent * circumference);

            if (scrollTop > 400) {
                backToTop.classList.remove('opacity-0', 'pointer-events-none');
                backToTop.classList.add('opacity-100', 'pointer-events-auto');
            } else {
                backToTop.classList.add('opacity-0', 'pointer-events-none');
                backToTop.classList.remove('opacity-100', 'pointer-events-auto');
            }
        });

        backToTop.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
    }

    // GSAP Animacije (ako su biblioteke učitane)
    if (typeof gsap !== 'undefined' && typeof ScrollTrigger !== 'undefined') {
        gsap.registerPlugin(ScrollTrigger);

        // Komandni centar (Pinned cards stacking)
        const cards = gsap.utils.toArray('.card');
        if (cards.length > 0 && document.getElementById('komandni-centar')) {
            const tl = gsap.timeline({
                scrollTrigger: {
                    trigger: "#komandni-centar",
                    start: "top top",
                    end: "+=3000",
                    pin: true,
                    scrub: 1.5,
                    pinSpacing: true
                }
            });

            cards.forEach((card, index) => {
                if (index === 0) {
                    // Prva karta lagano nestaje/skalira se kad druga dolazi
                    tl.to(card, { scale: 0.95, opacity: 0.8, duration: 1 }, 0.5);
                    return;
                }
                
                // Ostale karte dolaze odozdo
                tl.to(card, { 
                    y: 0, 
                    ease: "power2.out", 
                    duration: 1.5 
                }, (index - 0.5) * 1.2);

                if (index < cards.length - 1) {
                    // Karta koja je trenutno tu se blago povlači nazad
                    tl.to(card, { scale: 0.95, opacity: 0.8, duration: 1 }, index * 1.2 + 0.5);
                }
            });
        }

        // Elitni radnik (Floating items parallax & move)
        const floatingItems = gsap.utils.toArray('.floating-item');
        if (floatingItems.length > 0 && document.getElementById('target-audience')) {
            floatingItems.forEach((item, i) => {
                // Početna nasumična pozicija za lebdenje
                gsap.to(item, {
                    y: "-=20",
                    x: i % 2 === 0 ? "+=10" : "-=10",
                    duration: 2 + i,
                    repeat: -1,
                    yoyo: true,
                    ease: "sine.inOut"
                });

                // Scroll animacija - parallax efekat
                gsap.to(item, {
                    scrollTrigger: {
                        trigger: "#target-audience",
                        start: "top bottom",
                        end: "bottom top",
                        scrub: 2
                    },
                    y: i % 2 === 0 ? -100 : 100,
                    rotation: i % 2 === 0 ? 10 : -10,
                    ease: "none"
                });
            });

            // Nucleus spin
            if (document.getElementById('nucleus')) {
                gsap.to('#nucleus', {
                    scrollTrigger: {
                        trigger: "#target-audience",
                        start: "top bottom",
                        end: "bottom top",
                        scrub: 1
                    },
                    rotation: 360,
                    scale: 1.2,
                    ease: "none"
                });
            }
        }

        // Tri koraka do produktivnosti (Timeline steps)
        const steps = gsap.utils.toArray('.timeline-item');
        if (steps.length > 0 && document.getElementById('workflow-timeline')) {
            steps.forEach((step, i) => {
                const number = step.querySelector('.step-number');
                const icon = step.querySelector('.inline-flex');

                gsap.from(step, {
                    scrollTrigger: {
                        trigger: step,
                        start: "top 80%",
                        toggleActions: "play none none reverse"
                    },
                    y: 50,
                    opacity: 0,
                    duration: 1,
                    ease: "power3.out"
                });

                if (number) {
                    gsap.to(number, {
                        scrollTrigger: {
                            trigger: step,
                            start: "top 60%",
                            toggleActions: "play none none reverse"
                        },
                        color: "#00ff88", // Menja se u brand boju kad je u fokusu
                        opacity: 0.15,
                        scale: 1.1,
                        duration: 0.8
                    });
                }
            });
        }
    }

    // Feedback Forma (Uninstall stranica)
    const feedbackForm = document.getElementById('feedbackForm');
    if (feedbackForm) {
        feedbackForm.addEventListener('submit', function (e) {
            e.preventDefault();
            const btn = document.getElementById('btnTekst');
            if (btn) {
                btn.innerText = window.currentTranslations['uni_btn_sending'] || 'Slanje...';
                btn.disabled = true;
            }

            fetch("https://formsubmit.co/ajax/contact@milanwebportal.com", {
                method: "POST",
                headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
                body: JSON.stringify(Object.fromEntries(new FormData(this).entries()))
            })
            .then(response => {
                if (response.ok) {
                    document.getElementById('formSection')?.classList.add('hidden');
                    document.getElementById('hvalaPoruka')?.classList.remove('hidden');
                } else throw new Error();
            })
            .catch(() => {
                alert(window.currentTranslations['uni_alert_error'] || 'Greška.');
                if (btn) {
                    btn.innerText = window.currentTranslations['uni_form_btn'] || 'Pošalji';
                    btn.disabled = false;
                }
            });
        });
    }
});