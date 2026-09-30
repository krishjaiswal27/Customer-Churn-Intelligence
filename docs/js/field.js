/* Hero field: one mark per customer, grouped by contract.
   Loaded as a plain script at the end of the hero so the canvases are sized
   before first paint (no layout shift, no wait for the data file). */
(function () {
  "use strict";

  var root = document.documentElement;
  var hero = document.querySelector(".hero");
  var wrap = hero && hero.querySelector(".fields");
  if (!wrap) return;

  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!reduce) root.classList.add("js-motion");

  var LEFT = "#c8261b";
  var STAYED = "#8a8a8a";
  var DURATION = 1200;

  var figs = Array.prototype.slice.call(wrap.querySelectorAll(".field"));
  var scaleNote = wrap.querySelector(".fields__scale");
  var scale = 1;
  var states = [];

  function layout() {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    // Finer marks on desktop so the tallest block fits on the first screen.
    var cell = scale === 10 ? 8 : window.innerWidth >= 1024 ? 4 : 5;
    states = figs.map(function (fig) {
      var canvas = fig.querySelector("canvas");
      var n = Math.round(+fig.dataset.customers / scale);
      var c = Math.round(+fig.dataset.churned / scale);
      var w = canvas.clientWidth || fig.clientWidth;
      var perRow = Math.max(1, Math.floor(w / cell));
      var rows = Math.ceil(n / perRow);
      var h = rows * cell;
      canvas.style.height = h + "px";
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      var ctx = canvas.getContext("2d");
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      return { ctx: ctx, w: w, h: h, n: n, c: c, perRow: perRow, rows: rows, cell: cell };
    });
    if (scaleNote) {
      scaleNote.textContent = scale === 1 ? "1 mark = 1 customer" : "1 mark = 10 customers, rounded";
    }
  }

  function draw(s, rowsShown) {
    var ctx = s.ctx;
    var cell = s.cell;
    var sq = cell - 1;
    var dot = cell === 8 ? 3 : 2;
    var off = (cell - 1 - dot) / 2;
    var limit = Math.min(s.n, rowsShown * s.perRow);
    ctx.clearRect(0, 0, s.w, s.h);
    ctx.fillStyle = LEFT;
    for (var i = 0; i < Math.min(limit, s.c); i++) {
      ctx.fillRect((i % s.perRow) * cell, Math.floor(i / s.perRow) * cell, sq, sq);
    }
    ctx.fillStyle = STAYED;
    for (var j = s.c; j < limit; j++) {
      ctx.fillRect((j % s.perRow) * cell + off, Math.floor(j / s.perRow) * cell + off, dot, dot);
    }
  }

  function drawAll() {
    states.forEach(function (s) { draw(s, s.rows); });
  }

  // On phones, fall back to 1 mark = 10 customers if the hero would run
  // past about 1.5 screens at full resolution.
  function chooseScale() {
    var before = scale;
    scale = 1;
    layout();
    if (window.innerWidth < 768 && hero.getBoundingClientRect().height > window.innerHeight * 1.5) {
      scale = 10;
      layout();
    }
    return before !== scale;
  }

  function done() {
    root.classList.add("field-done");
  }

  chooseScale();

  if (reduce) {
    drawAll();
    done();
  } else {
    var start = null;
    var finished = false;
    var finish = function () {
      if (finished) return;
      finished = true;
      drawAll();
      done();
    };
    var step = function (now) {
      if (finished) return;
      if (start === null) start = now;
      var t = Math.min(1, (now - start) / DURATION);
      var eased = 1 - Math.pow(1 - t, 3);
      states.forEach(function (s) { draw(s, Math.ceil(eased * s.rows)); });
      if (t < 1) {
        window.requestAnimationFrame(step);
      } else {
        finish();
      }
    };
    window.requestAnimationFrame(step);
    // Background tabs throttle animation frames; never leave the field half drawn.
    setTimeout(finish, DURATION + 400);
  }

  var lastWidth = window.innerWidth;
  var timer;
  window.addEventListener("resize", function () {
    if (window.innerWidth === lastWidth) return; // ignore mobile toolbar height changes
    lastWidth = window.innerWidth;
    clearTimeout(timer);
    timer = setTimeout(function () {
      chooseScale();
      drawAll();
      done();
    }, 150);
  });

  // Web fonts change the headline height, which the phone check depends on.
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(function () {
      if (chooseScale()) {
        drawAll();
      } else if (root.classList.contains("field-done")) {
        drawAll();
      }
    });
  }
})();
