(function() {
  'use strict';

  /* ========================================================
     СБРОС СКРОЛЛА ПРИ ПЕРЕЗАГРУЗКЕ
     ======================================================== */
  if ('scrollRestoration' in history) {
    history.scrollRestoration = 'manual';
  }
  window.scrollTo(0, 0);

  /* ========================================================
     ПРЕДЗАГРУЗКА GLTF/GLB-МОДЕЛИ
     ======================================================== */
  // 🔧 Путь до модели. Положи файл рядом с index.html.
  //    .glb — один файл (рекомендуется)
  //    .gltf — + .bin и textures/ рядом
  const MODEL_URL = 'model.glb';

  window.__carModelPromise = new Promise((resolve, reject) => {
    if (typeof THREE === 'undefined' || typeof THREE.GLTFLoader === 'undefined') {
      console.warn('Three.js / GLTFLoader не подключены');
      reject(new Error('Three.js not available'));
      return;
    }
    const loader = new THREE.GLTFLoader();
    loader.load(
      MODEL_URL,
      (gltf) => {
        // gltf.scene — корневой Object3D модели
        const object = gltf.scene;

        // Центрируем
        const box = new THREE.Box3().setFromObject(object);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());

        object.position.x -= center.x;
        object.position.y -= center.y;
        object.position.z -= center.z;

        // Ставим на пол
        const newBox = new THREE.Box3().setFromObject(object);
        object.position.y -= newBox.min.y;

        // Масштабируем под сцену
        const maxDim = Math.max(size.x, size.y, size.z);
        const targetSize = 6;
        const scale = targetSize / maxDim;
        object.scale.setScalar(scale);

        // Тени + кодировка текстур
        object.traverse((child) => {
          if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
            if (child.material) {
              const mats = Array.isArray(child.material) ? child.material : [child.material];
              mats.forEach((m) => {
                if (m.map) m.map.encoding = THREE.sRGBEncoding;
                if (m.emissiveMap) m.emissiveMap.encoding = THREE.sRGBEncoding;
              });
            }
          }
        });

        resolve(object);
      },
      (xhr) => {
        // Прогресс загрузки — при желании выведи в консоль
        // console.log(`Загрузка модели: ${Math.round((xhr.loaded / xhr.total) * 100)}%`);
      },
      (err) => {
        console.error('Ошибка загрузки glTF:', err);
        reject(err);
      }
    );
  });

  /* ========================================================
     ПРЕЛОАДЕР — 3 СЕКУНДЫ + ЖДЁМ МОДЕЛЬ (макс 10 сек)
     ======================================================== */
  const preloader = document.getElementById('preloader');
  const preloaderCount = document.getElementById('preloaderCount');

  let secondsLeft = 3;
  if (preloaderCount) preloaderCount.textContent = secondsLeft;

  const preloaderInterval = setInterval(() => {
    secondsLeft--;
    if (secondsLeft < 0) secondsLeft = 0;
    if (preloaderCount) preloaderCount.textContent = secondsLeft;
    if (secondsLeft <= 0) clearInterval(preloaderInterval);
  }, 1000);

  function hidePreloader() {
    if (!preloader) return;
    preloader.classList.add('hidden');
    setTimeout(() => { preloader.style.display = 'none'; }, 700);
  }

  const minDelay = new Promise((r) => setTimeout(r, 3000));
  const maxDelay = new Promise((r) => setTimeout(r, 10000));
  const modelOrFail = window.__carModelPromise.catch(() => null);

  Promise.race([
    Promise.all([minDelay, modelOrFail]),
    maxDelay
  ]).then(hidePreloader);

  /* ========================================================
     🔒 БЛОКИРОВКА КОНТЕНТА ДО ПРОХОЖДЕНИЯ ТЕТРИСА
     ======================================================== */
  (function setupStageLock() {
    const GAME_KEY = 'bmw_tetris_passed';
    const resetBtn = document.getElementById('resetProgressBtn');

    function isGamePassed() {
      try {
        return localStorage.getItem(GAME_KEY) === 'true';
      } catch (e) {
        return false;
      }
    }

    function applyLockedState() {
      if (isGamePassed()) {
        document.body.classList.remove('game-locked');
      } else {
        document.body.classList.add('game-locked');
      }
      if (resetBtn) {
        resetBtn.style.display = isGamePassed() ? 'inline-flex' : 'none';
      }
    }

    function showGameToast(msg, isReset) {
      let toast = document.getElementById('lockToast');
      if (!toast) return;

      if (isReset) {
        toast.textContent = msg;
      } else if (!toast.querySelector('a')) {
        toast.innerHTML = 'Сначала пройди мини-игру 🎮 <a href="tetris.html">Играть →</a>';
      }

      toast.classList.add('show');
      clearTimeout(showGameToast._t);
      showGameToast._t = setTimeout(() => {
        toast.classList.remove('show');
      }, 2600);
    }

    function refreshLock() {
      applyLockedState();
      if (isGamePassed()) {
        const toast = document.getElementById('lockToast');
        if (toast) toast.classList.remove('show');
        document.body.classList.remove('lock-scroll');
      }
    }

    if (resetBtn) {
      resetBtn.addEventListener('click', function () {
        const ok = confirm('Точно сбросить прогресс? Придётся снова играть в Тетрис.');
        if (!ok) return;
        try { localStorage.removeItem(GAME_KEY); } catch (e) {}
        refreshLock();
        window.scrollTo({ top: 0, behavior: 'smooth' });
        showGameToast('Прогресс сброшен. Поиграем заново? 🎮', true);
      });
    }

    applyLockedState();

    window.addEventListener('pageshow', function (e) {
      if (e.persisted) refreshLock();
    });
    window.addEventListener('load', refreshLock);

    function isAtEndOfVisibleContent() {
      const ph = document.getElementById('placeholderBtn');
      if (!ph) return false;
      const rect = ph.getBoundingClientRect();
      return rect.bottom <= window.innerHeight + 40;
    }

    window.addEventListener('wheel', function (e) {
      if (isGamePassed()) return;
      if (e.deltaY <= 0) return;
      if (isAtEndOfVisibleContent()) {
        e.preventDefault();
        showGameToast();
      }
    }, { passive: false });

    let touchStartY = 0;
    window.addEventListener('touchstart', function (e) {
      touchStartY = e.touches[0].clientY;
    }, { passive: true });

    window.addEventListener('touchmove', function (e) {
      if (isGamePassed()) return;
      const dy = touchStartY - e.touches[0].clientY;
      if (dy <= 0) return;
      if (isAtEndOfVisibleContent()) {
        e.preventDefault();
        showGameToast();
      }
    }, { passive: false });

    setTimeout(refreshLock, 100);
    setTimeout(refreshLock, 500);
    setTimeout(refreshLock, 1500);
  })();

   /* ========================================================
     IGNITION — 3 ТАПА + УДЕРЖАНИЕ ДО 90%
     ======================================================== */
    const body        = document.body;
    const ignition    = document.getElementById('ignition');
    const ignitionBtn = document.getElementById('ignitionBtn');
    const ignitionTxt = ignitionBtn ? ignitionBtn.querySelector('.ignition-btn-text') : null;
    const rpmWrap     = document.getElementById('rpmWrap');
    const rpmFill     = document.getElementById('rpmFill');
    const rpmVal      = document.getElementById('rpmVal');
    const ignitionMsg = document.getElementById('ignitionMsg');

    const TARGET = 90;
    const HOLD_TICK_MS = 30;
    const RISE_PER_TICK = 1.6;
    const FALL_PER_TICK = 2.4;
    const TAPS_REQUIRED = 3;

    let rpm = 0;
    let holding = false;
    let done = false;
    let tickTimer = null;
    let tapCount = 0;
    let unlocked = false;

    function renderRpm() {
      const v = Math.max(0, Math.min(100, rpm));
      if (rpmFill) rpmFill.style.width = v + '%';
      if (rpmVal) rpmVal.textContent = Math.round(v);
      if (v >= TARGET && !done) markIgnitionDone();
    }

    function stepRpm() {
      rpm += holding ? RISE_PER_TICK : -FALL_PER_TICK;
      if (rpm < 0) rpm = 0;
      if (rpm > 100) rpm = 100;
      renderRpm();

      if (holding || rpm > 0) {
        tickTimer = setTimeout(stepRpm, HOLD_TICK_MS);
      } else {
        clearTimeout(tickTimer);
        tickTimer = null;
      }
    }

    function startTick() { if (!tickTimer) stepRpm(); }

    function updateButtonLabel() {
      if (!ignitionTxt) return;
      if (done) {
        ignitionTxt.textContent = 'ЗАВЕЛИСЬ!';
      } else if (!unlocked) {
        const left = TAPS_REQUIRED - tapCount;
        ignitionTxt.textContent = `НАЖМИ ${left} РАЗ` + (left === 1 ? '' : 'А');
      } else {
        ignitionTxt.textContent = 'ТЕПЕРЬ ЗАЖМИ!';
      }
    }

    function handleTap(e) {
      if (done) return;
      e.preventDefault();

      if (!unlocked) {
        tapCount++;
        if (ignitionBtn) ignitionBtn.classList.add('prep');
        if (tapCount >= TAPS_REQUIRED) {
          unlocked = true;
          if (ignitionBtn) ignitionBtn.classList.remove('prep');
        }
        updateButtonLabel();
        return;
      }

      if (!holding) {
        holding = true;
        if (ignitionBtn) ignitionBtn.classList.add('active');
        if (rpmWrap) rpmWrap.classList.add('show');
        startTick();
      }
    }

    function handleRelease() {
      if (done) return;
      if (!unlocked) return;
      holding = false;
      if (ignitionBtn) ignitionBtn.classList.remove('active');
    }

    if (ignitionTxt) ignitionTxt.textContent = `НАЖМИ ${TAPS_REQUIRED} РАЗА`;

    if (ignitionBtn) {
      ignitionBtn.addEventListener('mousedown', handleTap);
      ignitionBtn.addEventListener('touchstart', handleTap, { passive: false });
      ignitionBtn.addEventListener('mouseleave', handleRelease);
      ignitionBtn.addEventListener('touchcancel', handleRelease);
    }
    window.addEventListener('mouseup', handleRelease);
    window.addEventListener('touchend', handleRelease);

    function markIgnitionDone() {
      done = true;
      holding = false;
      rpm = TARGET;
      renderRpm();

      if (ignitionBtn) {
        ignitionBtn.classList.remove('active', 'prep');
        ignitionBtn.classList.add('done');
      }
      if (rpmWrap) rpmWrap.classList.add('passed');
      if (ignitionMsg) ignitionMsg.classList.add('show');
      updateButtonLabel();

      body.classList.remove('lock-scroll');
      if (navigator.vibrate) navigator.vibrate([30, 40, 30]);
    }

  /* ========================================================
     БЛОКИРОВКА СКРОЛЛА В ЗОНЕ IGNITION
     --------------------------------------------------------
     Как только пользователь докрутил до ignition и ещё не завёл —
     ставим body.lock-scroll (полный overflow: hidden), чтобы страница
     вообще не двигалась. Как только секция покинута или двигатель
     заведён — снимаем.
     ======================================================== */
  function isIgnitionActive() {
  if (!ignition) return false;
  const rect = ignition.getBoundingClientRect();
  // Ловим блок, как только его верх оказался в верхней половине экрана
  // (или выше), и при этом секция занимает существенную часть видимой области
  const topInView = rect.top <= window.innerHeight * 0.5;
  const bottomInView = rect.bottom >= window.innerHeight * 0.5;
  return topInView && bottomInView;
}

  function updateIgnitionLock() {
    if (!ignition) return;

    if (done) {
      body.classList.remove('lock-scroll');
      return;
    }

    if (isIgnitionActive()) {
      body.classList.add('lock-scroll');
    } else {
      body.classList.remove('lock-scroll');
    }
  }

  function showLockToast() {
    const lockToast = document.getElementById('lockToast');
    if (!lockToast) return;
    lockToast.textContent = 'Сначала заведи двигатель до 90% 🏎️';
    lockToast.classList.add('show');
    clearTimeout(showLockToast._t);
    showLockToast._t = setTimeout(() => lockToast.classList.remove('show'), 1600);
  }

  // Пересчитываем блокировку на каждом скролле/ресайзе
  window.addEventListener('scroll', updateIgnitionLock, { passive: true });
  window.addEventListener('resize', updateIgnitionLock, { passive: true });

  // Перехватываем колесо и тач, пока двигатель не заведён
  window.addEventListener('wheel', (e) => {
    if (!done && isIgnitionActive() && e.deltaY > 0) {
      e.preventDefault();
      showLockToast();
    }
  }, { passive: false });

  let touchStartY2 = 0;
  window.addEventListener('touchstart', (e) => {
    touchStartY2 = e.touches[0].clientY;
  }, { passive: true });

  window.addEventListener('touchmove', (e) => {
    if (done) return;
    if (!isIgnitionActive()) return;
    const dy = touchStartY2 - e.touches[0].clientY;
    if (dy > 10) {
      e.preventDefault();
      showLockToast();
    }
  }, { passive: false });

  // Первичная проверка (на случай, если страница открыта сразу на ignition)
  updateIgnitionLock();

  /* ========================================================
     SCENE — ПАРАЛЛАКС
     ======================================================== */
  const scene = document.getElementById('scene');
  const imageLayer = document.getElementById('imageLayer');
  const congratsLayer = document.getElementById('congratsLayer');
  const progressBar = document.getElementById('progressBar');
  const scrollHint = document.getElementById('scrollHint');

  const START_X = -100;
  const END_X = 0;

  let ticking = false;

  function updateScene() {
    if (!scene) return;
    const sceneRect = scene.getBoundingClientRect();
    const sceneHeight = scene.offsetHeight;
    const viewportH = window.innerHeight;

    const scrolled = -sceneRect.top;
    const maxScroll = sceneHeight - viewportH;

    let progress = scrolled / maxScroll;
    progress = Math.max(0, Math.min(1, progress));

    const translateX = START_X + (END_X - START_X) * progress;
    if (imageLayer) imageLayer.style.transform = `translateX(${translateX}%)`;

    const congratsOpacity = Math.max(0, 1 - progress * 1.4);
    const congratsScale = 1 + progress * 0.1;
    if (congratsLayer) {
      congratsLayer.style.opacity = congratsOpacity;
      congratsLayer.style.transform = `scale(${congratsScale})`;
    }

    if (progressBar) progressBar.style.width = (progress * 100) + '%';

    if (scrollHint) {
      scrollHint.style.opacity = progress > 0.05
        ? '0'
        : (0.5 + Math.sin(Date.now() / 500) * 0.3);
    }

    ticking = false;
  }

  function onScroll() {
    if (!ticking) {
      window.requestAnimationFrame(updateScene);
      ticking = true;
    }
  }

  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', updateScene, { passive: true });

  updateScene();

  /* ========================================================
     3D БЛОК — БЕРЁТ ГОТОВУЮ МОДЕЛЬ ИЗ ПРЕДЗАГРУЗКИ
     ======================================================== */
  (function initModel3D() {
    const stage      = document.getElementById('model3dStage');
    const canvas     = document.getElementById('model3dCanvas');
    const loaderEl   = document.getElementById('model3dLoader');
    const errorEl    = document.getElementById('model3dError');
    if (!stage || !canvas || typeof THREE === 'undefined') return;

    const scene3d = new THREE.Scene();
    scene3d.fog = new THREE.Fog(0x1a2129, 12, 32);

    const camera3d = new THREE.PerspectiveCamera(
      35,
      stage.clientWidth / stage.clientHeight,
      0.1,
      200
    );
    camera3d.position.set(8, 4.5, 10);
    camera3d.lookAt(0, 0.6, 0);

    const renderer = new THREE.WebGLRenderer({
      canvas: canvas,
      antialias: true,
      alpha: true
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(stage.clientWidth, stage.clientHeight, false);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputEncoding = THREE.sRGBEncoding;

    scene3d.add(new THREE.AmbientLight(0xffffff, 0.35));

    const keyLight = new THREE.DirectionalLight(0xffffff, 1.15);
    keyLight.position.set(6, 10, 5);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(1024, 1024);
    keyLight.shadow.camera.left   = -10;
    keyLight.shadow.camera.right  = 10;
    keyLight.shadow.camera.top    = 10;
    keyLight.shadow.camera.bottom = -10;
    scene3d.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0x4ea3ff, 0.9);
    rimLight.position.set(-8, 5, -6);
    scene3d.add(rimLight);

    const fillLight = new THREE.PointLight(0xffffff, 0.4, 25);
    fillLight.position.set(0, 4, 8);
    scene3d.add(fillLight);

    const platform = new THREE.Mesh(
      new THREE.CircleGeometry(4.5, 64),
      new THREE.MeshStandardMaterial({
        color: 0x1a2129,
        metalness: 0.3,
        roughness: 0.9,
        transparent: true,
        opacity: 0.9
      })
    );
    platform.rotation.x = -Math.PI / 2;
    platform.receiveShadow = true;
    scene3d.add(platform);

    const glow = new THREE.Mesh(
      new THREE.CircleGeometry(3.0, 48),
      new THREE.MeshBasicMaterial({
        color: 0x1c69d4,
        transparent: true,
        opacity: 0.18
      })
    );
    glow.rotation.x = -Math.PI / 2;
    glow.position.y = 0.01;
    scene3d.add(glow);

    const carGroup = new THREE.Group();
    scene3d.add(carGroup);

    let modelLoaded = false;
    let animId = null;
    const clock = new THREE.Clock();

    window.__carModelPromise
      .then((object) => {
        carGroup.add(object);
        modelLoaded = true;
        if (loaderEl) loaderEl.classList.add('hidden');
        if (!animId) animate();
      })
      .catch(() => {
        if (loaderEl) loaderEl.classList.add('hidden');
        if (errorEl) errorEl.classList.add('show');
      });

    function animate() {
      animId = requestAnimationFrame(animate);
      const t = clock.getElapsedTime();

      if (modelLoaded) {
        carGroup.rotation.y -= 0.005;
        carGroup.position.y = Math.sin(t * 1.2) * 0.05;
      }

      renderer.render(scene3d, camera3d);
    }

    function onResize() {
      const w = stage.clientWidth;
      const h = stage.clientHeight;
      if (!w || !h) return;
      camera3d.aspect = w / h;
      camera3d.updateProjectionMatrix();
      renderer.setSize(w, h, false);
    }
    window.addEventListener('resize', onResize, { passive: true });

    if ('IntersectionObserver' in window) {
      const io = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            if (!animId && modelLoaded) animate();
          } else {
            if (animId) {
              cancelAnimationFrame(animId);
              animId = null;
            }
          }
        });
      }, { threshold: 0.05 });
      io.observe(stage);
    }
  })();

})();