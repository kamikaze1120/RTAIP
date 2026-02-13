import React, { useEffect, useRef, useState } from 'react';
import { RtaEvent, eventSeverity } from '../services/data';
import * as THREE from 'three';
import { OrbitControls } from 'three-stdlib';

function latLonToVector3(lat: number, lon: number, radius: number): THREE.Vector3 {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lon + 180) * (Math.PI / 180);
  const x = -(radius * Math.sin(phi) * Math.cos(theta));
  const y = radius * Math.cos(phi);
  const z = radius * Math.sin(phi) * Math.sin(theta);
  return new THREE.Vector3(x, y, z);
}

const Globe: React.FC<{ events: RtaEvent[], focus: RtaEvent | null, onSelect?: (e: RtaEvent) => void, onHoverLatLon?: (lat: number, lon: number) => void }> = ({ events, focus, onSelect, onHoverLatLon }) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const [texture, setTexture] = useState<THREE.Texture | null>(null);
  const markersRef = useRef<THREE.Group>(new THREE.Group());
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const raycasterRef = useRef<THREE.Raycaster>(new THREE.Raycaster());
  const mouseRef = useRef<THREE.Vector2>(new THREE.Vector2());
  const [hovered, setHovered] = useState<{ e: RtaEvent; x: number; y: number } | null>(null);

  useEffect(() => {
    const loader = new THREE.TextureLoader();
    loader.setCrossOrigin('anonymous');
    loader.load('https://threejs.org/examples/textures/planets/earth_atmos_2048.jpg', (loadedTexture) => {
      setTexture(loadedTexture);
    }, undefined, () => setTexture(null));
  }, []);

  useEffect(() => {
    if (!mountRef.current) return;

    const scene = new THREE.Scene();
    cameraRef.current = new THREE.PerspectiveCamera(75, mountRef.current.clientWidth / mountRef.current.clientHeight, 0.1, 1000);
    rendererRef.current = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    rendererRef.current.setSize(mountRef.current.clientWidth, mountRef.current.clientHeight);
    mountRef.current.appendChild(rendererRef.current.domElement);

    const material = texture
      ? new THREE.MeshPhongMaterial({ map: texture, specular: new THREE.Color(0x222222), shininess: 12 })
      : new THREE.MeshPhongMaterial({ color: 0x0b1220, specular: new THREE.Color(0x222222), shininess: 12 });
    const sphereGeom = new THREE.SphereGeometry(5, 64, 64);
    const sphere = new THREE.Mesh(sphereGeom, material);
    sphere.name = 'globe';
    scene.add(sphere);

    const texLoader = new THREE.TextureLoader();
    texLoader.setCrossOrigin('anonymous');
    texLoader.load('https://threejs.org/examples/textures/planets/earth_specular_2048.jpg', (spec) => {
      (material as THREE.MeshPhongMaterial).specularMap = spec;
      material.needsUpdate = true;
    });
    texLoader.load('https://threejs.org/examples/textures/planets/earth_normal_2048.jpg', (bump) => {
      (material as THREE.MeshPhongMaterial).bumpMap = bump;
      (material as THREE.MeshPhongMaterial).bumpScale = 0.05;
      material.needsUpdate = true;
    });

    // remove grid/wire overlay per request

    const atmosphere = new THREE.Mesh(new THREE.SphereGeometry(5.2, 64, 64), new THREE.MeshBasicMaterial({ color: 0x2dd4bf, transparent: true, opacity: 0.06 }));
    scene.add(atmosphere);

    texLoader.load('https://threejs.org/examples/textures/planets/earth_clouds_2048.png', (cloudTex) => {
      const clouds = new THREE.Mesh(new THREE.SphereGeometry(5.06, 64, 64), new THREE.MeshPhongMaterial({ map: cloudTex, transparent: true, opacity: 0.35 }));
      clouds.name = 'clouds-layer';
      scene.add(clouds);
    });

    const stars = new THREE.BufferGeometry();
    const starCount = 4000; const positions = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      const r = 80; const theta = Math.random() * 2 * Math.PI; const phi = Math.acos(2 * Math.random() - 1);
      const x = r * Math.sin(phi) * Math.cos(theta);
      const y = r * Math.sin(phi) * Math.sin(theta);
      const z = r * Math.cos(phi);
      positions[i*3] = x; positions[i*3+1] = y; positions[i*3+2] = z;
    }
    stars.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const starField = new THREE.Points(stars, new THREE.PointsMaterial({ color: 0xffffff, size: 0.2, opacity: 0.7, transparent: true }));
    scene.add(starField);

    scene.add(markersRef.current);

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
    scene.add(ambientLight);

    const pointLight = new THREE.PointLight(0xffffff, 1.2);
    pointLight.position.set(15, 15, 15);
    scene.add(pointLight);

    controlsRef.current = new OrbitControls(cameraRef.current, rendererRef.current.domElement);
    controlsRef.current.enableDamping = true;
    controlsRef.current.dampingFactor = 0.05;
    controlsRef.current.screenSpacePanning = false;
    controlsRef.current.enableRotate = true; // allow user rotation but no auto-rotation
    controlsRef.current.enableZoom = true;
    controlsRef.current.minDistance = 5.3; // allow closer zoom near surface
    controlsRef.current.maxDistance = 25;

    cameraRef.current.position.z = 10;

    const animate = () => {
      requestAnimationFrame(animate);
      markersRef.current.children.forEach(marker => {
        const pulse = marker.children[0] as THREE.Mesh;
        const scale = 1 + Math.sin(Date.now() * 0.005) * 0.1;
        pulse.scale.set(scale, scale, scale);
        const opacity = 0.5 + Math.sin(Date.now() * 0.005) * 0.5;
        (pulse.material as THREE.MeshBasicMaterial).opacity = opacity;
      });
      // keep globe stationary
      // clouds static
      if (controlsRef.current) controlsRef.current.update();
      if (rendererRef.current && cameraRef.current) rendererRef.current.render(scene, cameraRef.current);
    };
    animate();

    const handleResize = () => {
      if (!mountRef.current || !rendererRef.current || !cameraRef.current) return;
      cameraRef.current.aspect = mountRef.current.clientWidth / mountRef.current.clientHeight;
      cameraRef.current.updateProjectionMatrix();
      rendererRef.current.setSize(mountRef.current.clientWidth, mountRef.current.clientHeight);
    };
    window.addEventListener('resize', handleResize);

    const handlePointerMove = (event: MouseEvent) => {
      if (!rendererRef.current || !cameraRef.current) return;
      const rect = rendererRef.current.domElement.getBoundingClientRect();
      mouseRef.current.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouseRef.current.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycasterRef.current.setFromCamera(mouseRef.current, cameraRef.current);
      const intersects = raycasterRef.current.intersectObjects(markersRef.current.children, true);
      if (intersects.length > 0) {
        const obj = intersects[0].object.parent as THREE.Group;
        const e = obj?.userData?.event as RtaEvent | undefined;
        if (e) setHovered({ e, x: event.clientX - rect.left, y: event.clientY - rect.top });
      } else {
        setHovered(null);
        const globeObj = scene.getObjectByName('globe') as THREE.Mesh | undefined;
        if (globeObj) {
          const globeHits = raycasterRef.current.intersectObject(globeObj, true);
          if (globeHits.length > 0) {
            const p = globeHits[0].point.clone();
            const r = 5;
            const lat = 90 - (Math.acos(p.y / r) * 180 / Math.PI);
            const lon = ((Math.atan2(p.z, -p.x) * 180 / Math.PI) - 180);
            if (onHoverLatLon) onHoverLatLon(lat, lon);
          }
        }
      }
    };

    const handleClick = () => {
      if (!rendererRef.current || !cameraRef.current) return;
      raycasterRef.current.setFromCamera(mouseRef.current, cameraRef.current);
      const intersects = raycasterRef.current.intersectObjects(markersRef.current.children, true);
      if (intersects.length > 0) {
        const obj = intersects[0].object.parent as THREE.Group;
        const e = obj?.userData?.event as RtaEvent | undefined;
        if (e) {
          const pos = latLonToVector3(e.latitude as number, e.longitude as number, 10);
          cameraRef.current.position.lerp(pos, 0.2);
          onSelect?.(e);
        }
      }
    };

    rendererRef.current?.domElement.addEventListener('mousemove', handlePointerMove);
    rendererRef.current?.domElement.addEventListener('click', handleClick);

    return () => {
      window.removeEventListener('resize', handleResize);
      rendererRef.current?.domElement.removeEventListener('mousemove', handlePointerMove);
      rendererRef.current?.domElement.removeEventListener('click', handleClick);
      if (rendererRef.current) mountRef.current?.removeChild(rendererRef.current.domElement);
    };
  }, [texture]);

  useEffect(() => {
    markersRef.current.clear();
    events.forEach(event => {
      if (event.latitude != null && event.longitude != null) {
        const sev = eventSeverity(event);
        const color = new THREE.Color().setHSL(0, 1, 0.5 - sev * 0.4);
        const size = 0.05 + sev * 0.15;
        
        const marker = new THREE.Group();
        const pulse = new THREE.Mesh(
          new THREE.SphereGeometry(size, 16, 16),
          new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.5 })
        );
        marker.add(pulse);

        const core = new THREE.Mesh(
          new THREE.SphereGeometry(size * 0.4, 16, 16),
          new THREE.MeshBasicMaterial({ color })
        );
        marker.add(core);

        const pos = latLonToVector3(event.latitude, event.longitude, 5);
        marker.position.copy(pos);
        marker.userData = { event };
        markersRef.current.add(marker);
      }
    });
  }, [events]);

  useEffect(() => {
    if (focus && focus.latitude != null && focus.longitude != null && cameraRef.current) {
      const pos = latLonToVector3(focus.latitude, focus.longitude, 10);
      cameraRef.current.position.lerp(pos, 0.1);
    }
  }, [focus]);

  return (
    <div ref={mountRef} className="flow-gradient" style={{ width: '100%', height: '100%', position: 'relative' }}>
      {hovered && (
        <div style={{ position: 'absolute', left: hovered.x + 12, top: hovered.y + 12, pointerEvents: 'none' }} className="px-2 py-1 rounded-md text-xs bg-black/70 border border-white/10 text-white shadow-lg">
          <div className="font-semibold">{String(hovered.e.source || 'Event')}</div>
          <div className="text-gray-300">{new Date(hovered.e.timestamp).toLocaleString()}</div>
          <div className="text-gray-400">Lat: {hovered.e.latitude} • Lon: {hovered.e.longitude}</div>
        </div>
      )}
    </div>
  );
};

export default Globe;