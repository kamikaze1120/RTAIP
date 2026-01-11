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

const Globe: React.FC<{ events: RtaEvent[], focus: RtaEvent | null }> = ({ events, focus }) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const [texture, setTexture] = useState<THREE.Texture | null>(null);
  const markersRef = useRef<THREE.Group>(new THREE.Group());
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);

  useEffect(() => {
    const loader = new THREE.TextureLoader();
    loader.load('/earth-bluemarble.jpeg', (loadedTexture) => {
      setTexture(loadedTexture);
    });
  }, []);

  useEffect(() => {
    if (!mountRef.current || !texture) return;

    const scene = new THREE.Scene();
    cameraRef.current = new THREE.PerspectiveCamera(75, mountRef.current.clientWidth / mountRef.current.clientHeight, 0.1, 1000);
    rendererRef.current = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    rendererRef.current.setSize(mountRef.current.clientWidth, mountRef.current.clientHeight);
    mountRef.current.appendChild(rendererRef.current.domElement);

    const sphere = new THREE.Mesh(
      new THREE.SphereGeometry(5, 64, 64),
      new THREE.MeshStandardMaterial({ map: texture, metalness: 0.3, roughness: 0.7 })
    );
    scene.add(sphere);

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
    controlsRef.current.minDistance = 6;
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

    return () => {
      window.removeEventListener('resize', handleResize);
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

  return <div ref={mountRef} style={{ width: '100%', height: '100%', background: 'radial-gradient(circle, rgba(30,30,35,1) 0%, rgba(10,10,10,1) 100%)' }} />;
};

export default Globe;