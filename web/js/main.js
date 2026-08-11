/* =========================================================
   Dots — site behaviour
   1. dot-matrix wordmark
   2. reactive dot field backdrop
   3. reveal on scroll, sticky bar, tilt, theme switch
   ========================================================= */
(function () {
	'use strict';

	var root = document.documentElement;
	var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

	/* ---------------------------------------------------------
	   1. wordmark — 5x7 dot matrix glyphs
	   --------------------------------------------------------- */

	var GLYPHS = {
		D: ['11110', '10001', '10001', '10001', '10001', '10001', '11110'],
		O: ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
		T: ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
		S: ['01111', '10000', '10000', '01110', '00001', '00001', '11110']
	};

	function buildWordmark(host) {
		var word = (host.dataset.word || 'DOTS').toUpperCase();
		var dots = [];
		var frag = document.createDocumentFragment();

		for (var l = 0; l < word.length; l++) {
			var rows = GLYPHS[word[l]];
			if (!rows) continue;

			var glyph = document.createElement('span');
			glyph.className = 'dm-glyph';

			for (var y = 0; y < rows.length; y++) {
				for (var x = 0; x < rows[y].length; x++) {
					var dot = document.createElement('span');
					var on = rows[y][x] === '1';
					dot.className = 'dm-dot' + (on ? ' is-on' : '');
					// a wave of delay running from top-left to bottom-right
					dot.style.setProperty('--d', (l * 90 + x * 34 + y * 26) + 'ms');
					dot.style.setProperty('--c', String(l * 5 + x));
					glyph.appendChild(dot);
					dots.push(dot);
				}
			}
			frag.appendChild(glyph);
		}
		host.appendChild(frag);

		// pop the dots in, then drop the stagger so hover stays snappy
		requestAnimationFrame(function () {
			requestAnimationFrame(function () {
				dots.forEach(function (d) { d.style.setProperty('--in', '1'); });
			});
		});
		setTimeout(function () {
			dots.forEach(function (d) { d.style.setProperty('--d', '0ms'); });
		}, 2200);

		if (reduced) return;

		// dots swell around the pointer
		var boxes = null;
		var refresh = function () { boxes = null; };
		window.addEventListener('resize', refresh);
		window.addEventListener('scroll', refresh, { passive: true });

		host.addEventListener('pointermove', function (e) {
			if (!boxes) {
				boxes = dots.map(function (d) {
					var r = d.getBoundingClientRect();
					return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
				});
			}
			for (var i = 0; i < dots.length; i++) {
				var dx = e.clientX - boxes[i].x;
				var dy = e.clientY - boxes[i].y;
				var d = Math.sqrt(dx * dx + dy * dy);
				var f = Math.max(0, 1 - d / 120);
				dots[i].style.setProperty('--s', String(1 + f * 0.85));
			}
		});

		host.addEventListener('pointerleave', function () {
			dots.forEach(function (d) { d.style.setProperty('--s', '1'); });
		});
	}

	var wordmark = document.querySelector('.dm-word');
	if (wordmark) buildWordmark(wordmark);

	/* ---------------------------------------------------------
	   2. the dot field
	   --------------------------------------------------------- */

	function dotField(canvas) {
		var ctx = canvas.getContext('2d', { alpha: true });
		var SPACING = 30;
		var REACH = 165;
		var w = 0, h = 0, dpr = 1;
		var pointer = { x: -9999, y: -9999, on: false };
		var ripples = [];
		var base = [0, 0, 0], accent = [91, 61, 245];

		function readColors() {
			var cs = getComputedStyle(root);
			base = cs.getPropertyValue('--dot-rgb').split(',').map(Number);
			accent = cs.getPropertyValue('--accent-rgb').split(',').map(Number);
		}

		function resize() {
			dpr = Math.min(window.devicePixelRatio || 1, 2);
			w = canvas.clientWidth;
			h = canvas.clientHeight;
			canvas.width = Math.round(w * dpr);
			canvas.height = Math.round(h * dpr);
			ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
		}

		function frame(t) {
			ctx.clearRect(0, 0, w, h);

			// the grid slides a little as the page scrolls — parallax without repaint cost
			var drift = (window.scrollY * 0.12) % SPACING;
			var now = t || 0;

			for (var y = -SPACING + drift; y < h + SPACING; y += SPACING) {
				for (var x = 0; x < w + SPACING; x += SPACING) {
					var wave = Math.sin(x * 0.011 + y * 0.014 - now * 0.0007) * 0.5 + 0.5;
					var a = 0.07 + wave * 0.05;
					var r = 1 + wave * 0.35;
					var mix = 0;

					if (pointer.on) {
						var dx = x - pointer.x, dy = y - pointer.y;
						var d = Math.sqrt(dx * dx + dy * dy);
						if (d < REACH) {
							var f = 1 - d / REACH;
							f = f * f;
							a += f * 0.55;
							r += f * 2.1;
							mix = f;
						}
					}

					for (var i = 0; i < ripples.length; i++) {
						var rp = ripples[i];
						var rd = Math.abs(Math.sqrt((x - rp.x) * (x - rp.x) + (y - rp.y) * (y - rp.y)) - rp.r);
						if (rd < 34) {
							var rf = (1 - rd / 34) * rp.life;
							a += rf * 0.6;
							r += rf * 2.4;
							mix = Math.max(mix, rf);
						}
					}

					var col = mix > 0
						? [
							Math.round(base[0] + (accent[0] - base[0]) * mix),
							Math.round(base[1] + (accent[1] - base[1]) * mix),
							Math.round(base[2] + (accent[2] - base[2]) * mix)
						]
						: base;

					ctx.beginPath();
					ctx.fillStyle = 'rgba(' + col[0] + ',' + col[1] + ',' + col[2] + ',' + a.toFixed(3) + ')';
					ctx.arc(x, y, r, 0, 6.2832);
					ctx.fill();
				}
			}

			for (var j = ripples.length - 1; j >= 0; j--) {
				ripples[j].r += 9;
				ripples[j].life -= 0.016;
				if (ripples[j].life <= 0) ripples.splice(j, 1);
			}
		}

		var running = true;
		function loop(t) {
			if (running && !document.hidden) frame(t);
			requestAnimationFrame(loop);
		}

		window.addEventListener('resize', function () { resize(); if (reduced) frame(0); });
		window.addEventListener('pointermove', function (e) {
			pointer.x = e.clientX;
			pointer.y = e.clientY;
			pointer.on = true;
			if (reduced) frame(0);
		});
		window.addEventListener('pointerleave', function () { pointer.on = false; });
		window.addEventListener('pointerdown', function (e) {
			if (reduced) return;
			ripples.push({ x: e.clientX, y: e.clientY, r: 0, life: 1 });
		});
		window.addEventListener('dots:theme', function () { readColors(); if (reduced) frame(0); });

		readColors();
		resize();
		if (reduced) { running = false; frame(0); } else { requestAnimationFrame(loop); }
	}

	var canvas = document.getElementById('dotfield');
	if (canvas && canvas.getContext) dotField(canvas);

	/* ---------------------------------------------------------
	   3. the small stuff
	   --------------------------------------------------------- */

	// reveal on scroll, staggered per group
	var reveals = document.querySelectorAll('.reveal');
	if ('IntersectionObserver' in window && !reduced) {
		// anything already on screen animates in right away, in order
		var shown = 0;
		reveals.forEach(function (el) {
			if (el.getBoundingClientRect().top < window.innerHeight * 0.95) {
				el.style.setProperty('--rd', (shown++ * 110) + 'ms');
				el.classList.add('is-in');
			}
		});

		var io = new IntersectionObserver(function (entries) {
			entries.forEach(function (entry, i) {
				if (!entry.isIntersecting) return;
				entry.target.style.setProperty('--rd', (i * 90) + 'ms');
				entry.target.classList.add('is-in');
				io.unobserve(entry.target);
			});
		}, { rootMargin: '0px 0px -12% 0px', threshold: 0.12 });
		reveals.forEach(function (el) { if (!el.classList.contains('is-in')) io.observe(el); });
	} else {
		reveals.forEach(function (el) { el.classList.add('is-in'); });
	}

	// sticky bar condenses after a bit of scrolling
	var topbar = document.getElementById('topbar');
	if (topbar) {
		var ticking = false;
		var onScroll = function () {
			if (ticking) return;
			ticking = true;
			requestAnimationFrame(function () {
				topbar.classList.toggle('is-stuck', window.scrollY > 24);
				ticking = false;
			});
		};
		window.addEventListener('scroll', onScroll, { passive: true });
		onScroll();
	}

	// screenshot tilts towards the pointer
	var screen = document.getElementById('screen');
	if (screen && !reduced && window.matchMedia('(hover: hover)').matches) {
		screen.addEventListener('pointermove', function (e) {
			var r = screen.getBoundingClientRect();
			var px = (e.clientX - r.left) / r.width - 0.5;
			var py = (e.clientY - r.top) / r.height - 0.5;
			screen.style.transition = 'transform .18s linear';
			screen.style.transform =
				'rotateX(' + (-py * 4).toFixed(2) + 'deg) rotateY(' + (px * 5).toFixed(2) + 'deg) translateY(-4px)';
		});
		screen.addEventListener('pointerleave', function () {
			screen.style.transition = '';
			screen.style.transform = '';
		});
	}

	// theme switch
	var toggle = document.getElementById('theme-toggle');
	function syncToggle() {
		if (toggle) toggle.setAttribute('aria-checked', root.dataset.theme === 'dark' ? 'true' : 'false');
	}
	if (toggle) {
		toggle.addEventListener('click', function () {
			root.dataset.theme = root.dataset.theme === 'dark' ? 'light' : 'dark';
			try { localStorage.setItem('dots-theme', root.dataset.theme); } catch (e) { }
			syncToggle();
			// let the canvas pick up the new palette once the transition has settled
			window.dispatchEvent(new Event('dots:theme'));
			setTimeout(function () { window.dispatchEvent(new Event('dots:theme')); }, 500);
		});
		syncToggle();
	}

	var year = document.getElementById('year');
	if (year) year.textContent = new Date().getFullYear();
})();
