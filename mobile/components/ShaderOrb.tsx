import React, { useEffect, useRef } from 'react';
import { View, Animated } from 'react-native';
import { GLView, ExpoWebGLRenderingContext } from 'expo-gl';
import { Renderer } from 'expo-three';
import * as THREE from 'three';

interface ShaderOrbProps {
    scaleAnim?: Animated.Value;
    opacityAnim?: Animated.Value;
    size?: number;
    colorHex?: number;
}

const VERTEX_SHADER = `
  uniform float u_time;
  uniform float u_intensity;
  
  //  Simplex 3D Noise 
  //  by Ian McEwan, Ashima Arts
  vec4 permute(vec4 x){return mod(((x*34.0)+1.0)*x, 289.0);}
  vec4 taylorInvSqrt(vec4 r){return 1.79284291400159 - 0.85373472095314 * r;}

  float snoise(vec3 v){ 
    const vec2  C = vec2(1.0/6.0, 1.0/3.0) ;
    const vec4  D = vec4(0.0, 0.5, 1.0, 2.0);

    // First corner
    vec3 i  = floor(v + dot(v, C.yyy) );
    vec3 x0 = v - i + dot(i, C.xxx) ;

    // Other corners
    vec3 g = step(x0.yzx, x0.xyz);
    vec3 l = 1.0 - g;
    vec3 i1 = min( g.xyz, l.zxy );
    vec3 i2 = max( g.xyz, l.zxy );

    //  x0 = x0 - 0.0 + 0.0 * C 
    vec3 x1 = x0 - i1 + 1.0 * C.xxx;
    vec3 x2 = x0 - i2 + 2.0 * C.xxx;
    vec3 x3 = x0 - 1.0 + 3.0 * C.xxx;

    // Permutations
    i = mod(i, 289.0 ); 
    vec4 p = permute( permute( permute( 
               i.z + vec4(0.0, i1.z, i2.z, 1.0 ))
             + i.y + vec4(0.0, i1.y, i2.y, 1.0 )) 
             + i.x + vec4(0.0, i1.x, i2.x, 1.0 ));

    // Gradients
    // ( N*N points uniformly over a square, mapped onto an octahedron.)
    float n_ = 1.0/7.0; // N=7
    vec3  ns = n_ * D.wyz - D.xzx;

    vec4 j = p - 49.0 * floor(p * ns.z *ns.z);  //  mod(p,N*N)

    vec4 x_ = floor(j * ns.z);
    vec4 y_ = floor(j - 7.0 * x_ );    // mod(j,N)

    vec4 x = x_ *ns.x + ns.yyyy;
    vec4 y = y_ *ns.x + ns.yyyy;
    vec4 h = 1.0 - abs(x) - abs(y);

    vec4 b0 = vec4( x.xy, y.xy );
    vec4 b1 = vec4( x.zw, y.zw );

    vec4 s0 = floor(b0)*2.0 + 1.0;
    vec4 s1 = floor(b1)*2.0 + 1.0;
    vec4 sh = -step(h, vec4(0.0));

    vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy ;
    vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww ;

    vec3 p0 = vec3(a0.xy,h.x);
    vec3 p1 = vec3(a0.zw,h.y);
    vec3 p2 = vec3(a1.xy,h.z);
    vec3 p3 = vec3(a1.zw,h.w);

    //Normalise gradients
    vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2, p2), dot(p3,p3)));
    p0 *= norm.x;
    p1 *= norm.y;
    p2 *= norm.z;
    p3 *= norm.w;

    // Mix final noise value
    vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
    m = m * m;
    return 42.0 * dot( m*m, vec4( dot(p0,x0), dot(p1,x1), 
                                  dot(p2,x2), dot(p3,x3) ) );
  }

  void main() {
    float noise = snoise(position * 2.5 + u_time * 0.8) * u_intensity;
    vec3 newPosition = position + normal * noise * 0.4;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(newPosition, 1.0);
  }
`;

const FRAGMENT_SHADER = `
  uniform vec3 u_color;
  uniform float u_opacity;
  
  void main() {
    gl_FragColor = vec4(u_color, u_opacity);
  }
`;

export default function ShaderOrb({
    scaleAnim = new Animated.Value(1),
    opacityAnim = new Animated.Value(1),
    size = 240,
    colorHex = 0x00e5ff
}: ShaderOrbProps) {
    const requestRef = useRef<number | null>(null);

    // Track state natively to pass into render loop
    const scaleRef = useRef(1);
    const opacityRef = useRef(1);
    const colorHexRef = useRef(colorHex);

    useEffect(() => {
        colorHexRef.current = colorHex;
    }, [colorHex]);

    useEffect(() => {
        const scaleSub = scaleAnim.addListener(({ value }) => { scaleRef.current = value; });
        const opacSub = opacityAnim.addListener(({ value }) => { opacityRef.current = value; });

        return () => {
            scaleAnim.removeListener(scaleSub);
            opacityAnim.removeListener(opacSub);
        };
    }, [scaleAnim, opacityAnim]);

    const onContextCreate = async (gl: ExpoWebGLRenderingContext) => {
        const { drawingBufferWidth: width, drawingBufferHeight: height } = gl;

        const renderer = new Renderer({ gl, antialias: true }) as unknown as THREE.WebGLRenderer;
        renderer.setSize(width, height);
        // Explicitly set clear color with 0 alpha for transparent background
        renderer.setClearColor(0x000000, 0);

        const scene = new THREE.Scene();
        // Adjust camera FOV/position slightly so a 240px container comfortably holds radius 1 scaled up
        const camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 100);
        camera.position.z = 4.0;

        // Detail 3 giving a good, medium-density wireframe
        const geometry = new THREE.IcosahedronGeometry(1.0, 3);

        const material = new THREE.ShaderMaterial({
            vertexShader: VERTEX_SHADER,
            fragmentShader: FRAGMENT_SHADER,
            uniforms: {
                u_time: { value: 0 },
                u_intensity: { value: 0.5 },
                u_color: { value: new THREE.Color(0x00e5ff) }, // Bright glowing cyan-blue
                u_opacity: { value: 0.5 }
            },
            wireframe: true,
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false, // Helps avoid wireframe occlusion artifacts
        });

        const icosphere = new THREE.Mesh(geometry, material);
        scene.add(icosphere);

        let startTime = Date.now();

        const render = () => {
            requestRef.current = requestAnimationFrame(render);

            const elapsedTime = (Date.now() - startTime) / 1000;

            material.uniforms.u_time.value = elapsedTime;

            const currentScale = scaleRef.current;
            // Base intensity 0.3, scales up heavily with pulse
            material.uniforms.u_intensity.value = (currentScale - 1.0) * 2.0 + 0.3;

            // Limit opacity to ~0.5 max, but scale down slightly if heavily transparent
            material.uniforms.u_opacity.value = opacityRef.current * 0.5;

            // Sync dynamic color
            material.uniforms.u_color.value.setHex(colorHexRef.current);

            icosphere.scale.setScalar(currentScale);
            icosphere.rotation.x = elapsedTime * 0.2;
            icosphere.rotation.y = elapsedTime * 0.25;

            renderer.render(scene, camera);
            gl.endFrameEXP();
        };

        render();
    };

    return (
        <View style={{ width: size, height: size }} pointerEvents="none">
            <GLView
                style={{ flex: 1, backgroundColor: 'transparent' }}
                onContextCreate={onContextCreate}
            />
        </View>
    );
}
