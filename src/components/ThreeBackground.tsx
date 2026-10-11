import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useTheme } from '../context/ThemeContext';

export default function ThreeBackground() {
  const containerRef = useRef<HTMLDivElement>(null);
  const { isDark } = useTheme();

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !isDark) return;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);

    const count = 1200;
    const range = 25;

    const particlesGeo = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    const velocities: { x: number; y: number; z: number }[] = [];

    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * range;
      positions[i * 3 + 1] = (Math.random() - 0.5) * range;
      positions[i * 3 + 2] = (Math.random() - 0.5) * range;

      const color = new THREE.Color();
      const darkMode = isDark;
      if (i < 400) color.setHSL(0.55, 0.7, darkMode ? 0.5 + Math.random() * 0.3 : 0.7 + Math.random() * 0.2);
      else if (i < 800) color.setHSL(0.08, 0.6, darkMode ? 0.5 + Math.random() * 0.3 : 0.7 + Math.random() * 0.2);
      else color.setHSL(0.6, 0.8, darkMode ? 0.4 + Math.random() * 0.3 : 0.65 + Math.random() * 0.2);

      colors[i * 3] = color.r;
      colors[i * 3 + 1] = color.g;
      colors[i * 3 + 2] = color.b;
      sizes[i] = Math.random() * 2 + 0.5;
      velocities.push({
        x: (Math.random() - 0.5) * 0.008,
        y: (Math.random() - 0.5) * 0.008,
        z: (Math.random() - 0.5) * 0.008,
      });
    }

    particlesGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    particlesGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const texture = (() => {
      const canvas = document.createElement('canvas');
      canvas.width = 32;
      canvas.height = 32;
      const ctx = canvas.getContext('2d')!;
      const gradient = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
      gradient.addColorStop(0, 'rgba(255,255,255,1)');
      gradient.addColorStop(0.2, 'rgba(255,255,255,0.8)');
      gradient.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, 32, 32);
      return new THREE.CanvasTexture(canvas);
    })();

    const particleOpacity = isDark ? 0.9 : 0.5;
    const material = new THREE.PointsMaterial({
      size: isDark ? 0.12 : 0.18,
      map: texture,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true,
      opacity: particleOpacity,
      vertexColors: true,
    });

    const particles = new THREE.Points(particlesGeo, material);
    scene.add(particles);

    const centerGeo = new THREE.IcosahedronGeometry(0.8, 1);
    const centerMat = new THREE.MeshPhongMaterial({
      color: isDark ? 0x00d4ff : 0x3399ff,
      wireframe: true,
      transparent: true,
      opacity: isDark ? 0.25 : 0.15,
      emissive: isDark ? 0x00d4ff : 0x3399ff,
      emissiveIntensity: isDark ? 0.15 : 0.05,
    });
    const centerMesh = new THREE.Mesh(centerGeo, centerMat);
    centerMesh.position.set(0, 0, 0);
    scene.add(centerMesh);

    const innerGeo = new THREE.TorusKnotGeometry(1.5, 0.3, 64, 8);
    const innerMat = new THREE.MeshPhongMaterial({
      color: isDark ? 0x448aff : 0x6699ff,
      wireframe: true,
      transparent: true,
      opacity: isDark ? 0.08 : 0.06,
    });
    const innerMesh = new THREE.Mesh(innerGeo, innerMat);
    scene.add(innerMesh);

    const ambientLight = new THREE.AmbientLight(0x404060, isDark ? 0.5 : 0.3);
    scene.add(ambientLight);
    const pointLight = new THREE.PointLight(isDark ? 0x00d4ff : 0x0066cc, isDark ? 1 : 0.4, 30);
    pointLight.position.set(5, 5, 5);
    scene.add(pointLight);
    const pointLight2 = new THREE.PointLight(isDark ? 0x448aff : 0x0044aa, isDark ? 0.5 : 0.2, 30);
    pointLight2.position.set(-5, -3, -5);
    scene.add(pointLight2);

    const lineMaterial = new THREE.LineBasicMaterial({
      color: isDark ? 0x00d4ff : 0x4488ff,
      transparent: true,
      opacity: isDark ? 0.06 : 0.04,
    });
    const lineGeo = new THREE.BufferGeometry();
    const linePoints = new Float32Array(count * 3 * 10);
    lineGeo.setAttribute('position', new THREE.BufferAttribute(linePoints, 3));
    lineGeo.setDrawRange(0, 0);
    const lineMesh = new THREE.LineSegments(lineGeo, lineMaterial);
    scene.add(lineMesh);

    const starShape = new THREE.Shape();
    const outerR = 0.6;
    const innerR = 0.25;
    const starPoints = 5;
    for (let i = 0; i < starPoints * 2; i++) {
      const radius = i % 2 === 0 ? outerR : innerR;
      const angle = (i / (starPoints * 2)) * Math.PI * 2 - Math.PI / 2;
      const x = Math.cos(angle) * radius;
      const y = Math.sin(angle) * radius;
      if (i === 0) starShape.moveTo(x, y);
      else starShape.lineTo(x, y);
    }
    starShape.closePath();
    const starGeo = new THREE.ShapeGeometry(starShape);
    const starMat = new THREE.MeshPhongMaterial({
      color: 0x00d4ff,
      emissive: 0x00d4ff,
      emissiveIntensity: isDark ? 0.5 : 0.15,
      transparent: true,
      opacity: isDark ? 0.7 : 0.4,
      side: THREE.DoubleSide,
    });
    const starMesh = new THREE.Mesh(starGeo, starMat);
    starMesh.position.set(3, 2, -2);
    scene.add(starMesh);

    const starGlowGeo = new THREE.SphereGeometry(0.08, 8, 8);
    const starGlowMat = new THREE.MeshBasicMaterial({
      color: 0x00ddff,
      transparent: true,
      opacity: isDark ? 0.9 : 0.6,
    });
    const starGlow = new THREE.Mesh(starGlowGeo, starGlowMat);
    starMesh.add(starGlow);

    camera.position.z = 12;

    let mouseX = 0;
    let mouseY = 0;
    let targetRotX = 0;
    let targetRotY = 0;

    const handleMouseMove = (e: MouseEvent) => {
      mouseX = (e.clientX / window.innerWidth) * 2 - 1;
      mouseY = -(e.clientY / window.innerHeight) * 2 + 1;
      targetRotX = mouseY * 0.5;
      targetRotY = mouseX * 0.5;
    };
    window.addEventListener('mousemove', handleMouseMove);

    const handleResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener('resize', handleResize);

    let time = 0;
    let rotX = 0;
    let rotY = 0;

    const animate = () => {
      requestAnimationFrame(animate);
      time += 0.003;

      rotX += (targetRotX - rotX) * 0.02;
      rotY += (targetRotY - rotY) * 0.02;

      particles.rotation.x = rotX * 0.3;
      particles.rotation.y = rotY * 0.3;

      const pos = particles.geometry.attributes.position.array as Float32Array;
      for (let i = 0; i < count; i++) {
        const i3 = i * 3;
        pos[i3] += velocities[i].x;
        pos[i3 + 1] += velocities[i].y;
        pos[i3 + 2] += velocities[i].z;
        if (Math.abs(pos[i3]) > range / 2) velocities[i].x *= -1;
        if (Math.abs(pos[i3 + 1]) > range / 2) velocities[i].y *= -1;
        if (Math.abs(pos[i3 + 2]) > range / 2) velocities[i].z *= -1;
      }
      particles.geometry.attributes.position.needsUpdate = true;

      let lineIndex = 0;
      for (let i = 0; i < count; i += 3) {
        const i3 = i * 3;
        for (let j = i + 1; j < count; j += 3) {
          const j3 = j * 3;
          const dx = pos[i3] - pos[j3];
          const dy = pos[i3 + 1] - pos[j3 + 1];
          const dz = pos[i3 + 2] - pos[j3 + 2];
          const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
          if (dist < 3.5 && lineIndex < linePoints.length) {
            linePoints[lineIndex] = pos[i3];
            linePoints[lineIndex + 1] = pos[i3 + 1];
            linePoints[lineIndex + 2] = pos[i3 + 2];
            linePoints[lineIndex + 3] = pos[j3];
            linePoints[lineIndex + 4] = pos[j3 + 1];
            linePoints[lineIndex + 5] = pos[j3 + 2];
            lineIndex += 6;
          }
        }
      }

      lineMesh.geometry.attributes.position.needsUpdate = true;
      lineMesh.geometry.setDrawRange(0, lineIndex / 3);

      const hue = (Math.sin(time * 0.1) * 0.1 + 0.55);
      const color = new THREE.Color().setHSL(hue, 0.8, isDark ? 0.5 : 0.6);
      centerMat.color.set(color);
      centerMat.emissive.set(color);
      lineMaterial.color.set(color);

      centerMesh.rotation.x += 0.005;
      centerMesh.rotation.y += 0.008;
      centerMesh.rotation.z += 0.003;

      innerMesh.rotation.x += 0.003;
      innerMesh.rotation.y += 0.005;
      innerMesh.rotation.z += 0.002;

      innerMesh.position.x += (mouseX * 0.5 - innerMesh.position.x) * 0.01;
      innerMesh.position.y += (mouseY * 0.5 - innerMesh.position.y) * 0.01;

      const hue2 = (Math.sin(time * 0.08) * 0.15 + 0.6);
      const color2 = new THREE.Color().setHSL(hue2, 0.7, isDark ? 0.5 : 0.6);
      innerMat.color.set(color2);

      const starX = Math.sin(time * 0.3) * 5;
      const starY = Math.cos(time * 0.2) * 3;
      const starZ = Math.sin(time * 0.15) * 3 - 1;
      starMesh.position.set(starX, starY, starZ);
      starMesh.rotation.z = time * 0.5;

      const starPulse = Math.sin(time * 2) * 0.3 + 0.7;
      starMat.opacity = (isDark ? 0.7 : 0.4) * starPulse;
      starGlow.material.opacity = (isDark ? 0.9 : 0.6) * starPulse;
      const glowScale = Math.sin(time * 2) * 0.3 + 0.7;
      starGlow.scale.set(glowScale, glowScale, glowScale);

      renderer.render(scene, camera);
    };
    animate();

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('resize', handleResize);
      container.removeChild(renderer.domElement);
      renderer.dispose();
    };
  }, [isDark]);

  return (
    <div
      ref={containerRef}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 0,
        pointerEvents: 'none',
      }}
    />
  );
}
