import { useEffect, useRef, useState } from "react";
import * as THREE from "three";

export default function Avatar({ listening, playing, processing }) {
  const host = useRef(null);
  const activity = useRef({ listening, playing, processing });
  activity.current = { listening, playing, processing };
  const [fallback, setFallback] = useState(false);

  useEffect(() => {
    const container = host.current;
    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      setFallback(true);
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);
    container.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100);
    camera.position.set(0, 0.7, 9);
    camera.lookAt(0, 0.25, 0);
    scene.add(new THREE.HemisphereLight(0xe6f3ff, 0x152540, 3));
    const key = new THREE.DirectionalLight(0xfff2df, 3.2);
    key.position.set(-3, 5, 4);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0x52ceef, 2.5);
    rim.position.set(3, 1, -2);
    scene.add(rim);
    const porcelain = new THREE.MeshStandardMaterial({ color: 0xe8eef8, metalness: 0.22, roughness: 0.27 });
    const green = new THREE.MeshStandardMaterial({ color: 0x153d65, metalness: 0.55, roughness: 0.28 });
    const gold = new THREE.MeshStandardMaterial({ color: 0xd4b475, metalness: 0.75, roughness: 0.25 });
    const glass = new THREE.MeshStandardMaterial({ color: 0x07182d, metalness: 0.4, roughness: 0.16 });
    const glow = new THREE.MeshStandardMaterial({ color: 0x8cecff, emissive: 0x28bad7, emissiveIntensity: 1.6 });
    const avatar = new THREE.Group();
    scene.add(avatar);
    function sphere(parent, material, position, scale) {
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 32), material);
      mesh.position.set(...position);
      mesh.scale.set(...scale);
      parent.add(mesh);
      return mesh;
    }
    sphere(avatar, porcelain, [0, -0.65, 0], [0.84, 0.86, 0.59]);
    sphere(avatar, green, [0, -0.82, 0.29], [0.65, 0.59, 0.43]);
    const head = new THREE.Group();
    head.position.y = 0.8;
    avatar.add(head);
    sphere(head, porcelain, [0, 0, 0], [1.08, 0.9, 0.76]);
    sphere(head, glass, [0, -0.06, 0.48], [0.88, 0.59, 0.37]);
    const eyes = [-0.34, 0.34].map(x => sphere(head, glow, [x, 0.02, 0.816], [0.095, 0.15, 0.044]));
    const smile = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.023, 12, 36, Math.PI * 0.75), glow);
    smile.position.set(0, -0.16, 0.847);
    smile.rotation.z = Math.PI * 1.125;
    head.add(smile);
    [-1, 1].forEach(side => {
      sphere(head, gold, [side * 1.02, 0, 0], [0.15, 0.3, 0.3]);
      sphere(avatar, porcelain, [side * 0.94, -0.59, 0], [0.23, 0.55, 0.27]).rotation.z = side * 0.25;
    });
    const badge = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.035, 12, 40), gold);
    badge.position.set(0, -0.63, 0.726);
    avatar.add(badge);
    sphere(avatar, glow, [0, -0.63, 0.73], [0.055, 0.055, 0.035]);
    const orbit = new THREE.Mesh(new THREE.TorusGeometry(1.78, 0.015, 12, 120), gold);
    orbit.rotation.x = Math.PI / 2.25;
    orbit.position.y = -1.8;
    scene.add(orbit);
    const pointer = { x: 0, y: 0 };
    const move = (event) => {
      const rect = container.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width - 0.5) * 0.4;
      pointer.y = ((event.clientY - rect.top) / rect.height - 0.5) * 0.12;
    };
    const reset = () => { pointer.x = 0; pointer.y = 0; };
    container.addEventListener("pointermove", move);
    container.addEventListener("pointerleave", reset);
    const resize = new ResizeObserver(() => {
      const { width, height } = container.getBoundingClientRect();
      if (!width || !height) return;
      renderer.setSize(width, height);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    });
    resize.observe(container);
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    let frame;
    const render = (time) => {
      const t = time / 1000;
      const active = activity.current;
      if (!reduced.matches) {
        avatar.position.y = Math.sin(t * 1.5) * 0.085;
        avatar.rotation.y += ((active.listening ? -0.1 : pointer.x) - avatar.rotation.y) * 0.04;
        head.rotation.z = active.listening ? Math.sin(t * 2) * 0.045 : Math.sin(t * 0.65) * 0.025;
        head.rotation.x += (pointer.y - head.rotation.x) * 0.04;
        const blink = Math.sin(t * 0.8) > 0.993 ? 0.025 : 0.15;
        eyes.forEach(eye => { eye.scale.y = blink; });
        orbit.rotation.z = t * 0.15;
      }
      glow.emissiveIntensity = active.listening ? 2.5 : active.playing ? 1.8 : 1.2;
      orbit.rotation.y = active.processing && !reduced.matches ? t : 0;
      renderer.render(scene, camera);
      frame = requestAnimationFrame(render);
    };
    frame = requestAnimationFrame(render);
    const lost = event => { event.preventDefault(); setFallback(true); cancelAnimationFrame(frame); };
    renderer.domElement.addEventListener("webglcontextlost", lost);
    return () => {
      cancelAnimationFrame(frame);
      resize.disconnect();
      container.removeEventListener("pointermove", move);
      container.removeEventListener("pointerleave", reset);
      renderer.domElement.removeEventListener("webglcontextlost", lost);
      scene.traverse(object => object.geometry?.dispose());
      [porcelain, green, gold, glass, glow].forEach(material => material.dispose());
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);

  return <div className="avatar-render" ref={host} role="img" aria-label="أفاتار مساعد القرآن ثلاثي الأبعاد">
    {fallback && <div className="avatar-fallback" aria-hidden="true"><span>◕‿◕</span></div>}
  </div>;
}
