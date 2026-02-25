import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated } from 'react-native';
import { GLView, ExpoWebGLRenderingContext } from 'expo-gl';

interface ShaderOrbProps {
    scaleAnim?: Animated.Value;
    opacityAnim?: Animated.Value;
    size?: number;
    colorBase?: [number, number, number];
    colorHighlight?: [number, number, number];
}

const VERTEX_SHADER = `
  attribute vec2 position;
  varying vec2 vUv;
  void main() {
    vUv = position * 0.5 + 0.5; // Map from [-1, 1] to [0, 1]
    gl_Position = vec4(position, 0.0, 1.0);
  }
`;

const FRAGMENT_SHADER = `
  precision highp float;
  varying vec2 vUv;
  
  uniform float u_time;
  uniform float u_scale;
  uniform float u_opacity;
  uniform vec2 u_resolution;
  uniform vec3 u_colorBase;
  uniform vec3 u_colorHighlight;

  // --- Simplex Noise Functions ---
  vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec2 mod289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec3 permute(vec3 x) { return mod289(((x*34.0)+1.0)*x); }

  float snoise(vec2 v) {
    const vec4 C = vec4(0.211324865405187, 0.366025403784439,
             -0.577350269189626, 0.024390243902439);
    vec2 i  = floor(v + dot(v, C.yy) );
    vec2 x0 = v -   i + dot(i, C.xx);

    vec2 i1;
    i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
    vec4 x12 = x0.xyxy + C.xxzz;
    x12.xy -= i1;

    i = mod289(i);
    vec3 p = permute( permute( i.y + vec3(0.0, i1.y, 1.0 ))
    + i.x + vec3(0.0, i1.x, 1.0 ));

    vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0);
    m = m*m ;
    m = m*m ;

    vec3 x = 2.0 * fract(p * C.www) - 1.0;
    vec3 h = abs(x) - 0.5;
    vec3 ox = floor(x + 0.5);
    vec3 a0 = x - ox;

    m *= 1.79284291400159 - 0.85373472095314 * ( a0*a0 + h*h );

    vec3 g;
    g.x  = a0.x  * x0.x  + h.x  * x0.y;
    g.yz = a0.yz * x12.xz + h.yz * x12.yw;
    return 130.0 * dot(m, g);
  }

  void main() {
    // Center UV coordinates
    vec2 uv = vUv * 2.0 - 1.0;
    
    // Adjust for aspect ratio
    uv.x *= u_resolution.x / u_resolution.y;
    
    // Distance from center
    float dist = length(uv);
    
    // Fluid Edge Deformation ("Flowing Edges")
    // Use angle to perturb the radius to make it non-circular
    float angle = atan(uv.y, uv.x);
    float edgeDeformation = snoise(vec2(cos(angle) * 1.5, sin(angle) * 1.5 + u_time * 0.4)) * 0.08;
    
    // Base circle radius (influenced by React Native Animated scale + fluid deformation)
    float radius = (0.75 * u_scale) + edgeDeformation;
    
    // If outside the circle, absolutely discard to be transparent (alpha 0)
    if (dist > radius) {
      gl_FragColor = vec4(0.0, 0.0, 0.0, 0.0);
      return;
    }
    
    // Fluid Noise Generation ("Swirling Silk")
    // Use layered noise for a more complex fluid feel
    vec2 noiseUv1 = uv * 2.0 + u_time * 0.2;
    vec2 noiseUv2 = uv * 3.5 - u_time * 0.15;
    
    float n1 = snoise(noiseUv1);
    float n2 = snoise(noiseUv2 + n1);
    float finalNoise = (n1 + n2) * 0.5 + 0.5; // Map to 0-1
    
    // Base Colors mapped from uniforms
    vec3 colorBase = u_colorBase;
    vec3 colorHighlight = u_colorHighlight;
    
    // Mix colors based on noise
    vec3 fluidColor = mix(colorBase, colorHighlight, finalNoise);
    
    // Fresnel / Rim Glow effect
    // 0.0 at center, 1.0 at edge
    float rim = smoothstep(0.0, radius, dist);
    // Exponential curve to make it "glow" at the very edge
    rim = pow(rim, 2.5); 
    
    // Add white-ish glow on the edge
    fluidColor = mix(fluidColor, vec3(0.8, 1.0, 1.0), rim * 0.8);
    
    // Inside alpha: mostly solid, but slightly translucent in the middle, highly opaque at the rim
    // Multiply by the React Native opacity uniform
    float alpha = mix(0.7, 1.0, rim) * u_opacity;
    
    // Final output: pre-multiplied alpha is sometimes needed for WebGL on mobile, 
    // but we'll stick to standard straight alpha blending for now.
    gl_FragColor = vec4(fluidColor, alpha);
  }
`;

export default function ShaderOrb({
    scaleAnim = new Animated.Value(1),
    opacityAnim = new Animated.Value(1),
    size = 240,
    colorBase = [0.0, 0.6, 0.7],
    colorHighlight = [0.2, 0.9, 0.8]
}: ShaderOrbProps) {
    const glRef = useRef<ExpoWebGLRenderingContext | null>(null);
    const requestRef = useRef<number | null>(null);
    const programRef = useRef<WebGLProgram | null>(null);

    // Track state natively to pass into render loop
    const scaleRef = useRef(1);
    const opacityRef = useRef(1);
    const colorBaseRef = useRef(colorBase);
    const colorHighlightRef = useRef(colorHighlight);

    // Keep color refs in sync with prop changes
    useEffect(() => {
        colorBaseRef.current = colorBase;
    }, [colorBase]);

    useEffect(() => {
        colorHighlightRef.current = colorHighlight;
    }, [colorHighlight]);

    useEffect(() => {
        const scaleSub = scaleAnim.addListener(({ value }) => { scaleRef.current = value; });
        const opacSub = opacityAnim.addListener(({ value }) => { opacityRef.current = value; });

        return () => {
            scaleAnim.removeListener(scaleSub);
            opacityAnim.removeListener(opacSub);
        };
    }, [scaleAnim, opacityAnim]);

    const onContextCreate = (gl: ExpoWebGLRenderingContext) => {
        glRef.current = gl;

        // 1. Compile Shaders
        const vert = gl.createShader(gl.VERTEX_SHADER);
        const frag = gl.createShader(gl.FRAGMENT_SHADER);
        if (!vert || !frag) return;

        gl.shaderSource(vert, VERTEX_SHADER);
        gl.compileShader(vert);
        if (!gl.getShaderParameter(vert, gl.COMPILE_STATUS)) {
            console.error("Vertex Shader Error:", gl.getShaderInfoLog(vert));
        }

        gl.shaderSource(frag, FRAGMENT_SHADER);
        gl.compileShader(frag);
        if (!gl.getShaderParameter(frag, gl.COMPILE_STATUS)) {
            console.error("Fragment Shader Error:", gl.getShaderInfoLog(frag));
        }

        // 2. Link Program
        const program = gl.createProgram();
        if (!program) return;

        gl.attachShader(program, vert);
        gl.attachShader(program, frag);
        gl.linkProgram(program);
        programRef.current = program;

        // 3. Setup Geometry (Full Screen Quad)
        const buffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.bufferData(
            gl.ARRAY_BUFFER,
            new Float32Array([
                -1.0, -1.0,
                1.0, -1.0,
                -1.0, 1.0,
                -1.0, 1.0,
                1.0, -1.0,
                1.0, 1.0,
            ]),
            gl.STATIC_DRAW
        );

        const positionLoc = gl.getAttribLocation(program, "position");
        gl.enableVertexAttribArray(positionLoc);
        gl.vertexAttribPointer(positionLoc, 2, gl.FLOAT, false, 0, 0);

        // Uniform Locations
        const timeLoc = gl.getUniformLocation(program, "u_time");
        const scaleLoc = gl.getUniformLocation(program, "u_scale");
        const opacityLoc = gl.getUniformLocation(program, "u_opacity");
        const resolutionLoc = gl.getUniformLocation(program, "u_resolution");
        const colorBaseLoc = gl.getUniformLocation(program, "u_colorBase");
        const colorHighlightLoc = gl.getUniformLocation(program, "u_colorHighlight");

        // Enable Alpha Blending
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

        // Clear to perfectly transparent
        gl.clearColor(0.0, 0.0, 0.0, 0.0);

        let startTime = Date.now();

        // 4. Render Loop
        const render = () => {
            if (!gl) return;

            const currentTime = (Date.now() - startTime) / 1000.0;

            gl.clear(gl.COLOR_BUFFER_BIT);
            gl.useProgram(program);

            // Pass updated uniforms
            gl.uniform1f(timeLoc, currentTime);
            gl.uniform1f(scaleLoc, scaleRef.current);
            gl.uniform1f(opacityLoc, opacityRef.current);
            gl.uniform2f(resolutionLoc, gl.drawingBufferWidth, gl.drawingBufferHeight);
            gl.uniform3f(colorBaseLoc, colorBaseRef.current[0], colorBaseRef.current[1], colorBaseRef.current[2]);
            gl.uniform3f(colorHighlightLoc, colorHighlightRef.current[0], colorHighlightRef.current[1], colorHighlightRef.current[2]);

            // Draw
            gl.drawArrays(gl.TRIANGLES, 0, 6);

            gl.flush();
            // @ts-ignore - expo-gl types sometimes incorrectly expect an argument here
            gl.endFrameEXP();

            requestRef.current = requestAnimationFrame(render);
        };

        render();
    };

    useEffect(() => {
        return () => {
            if (requestRef.current) cancelAnimationFrame(requestRef.current);
        };
    }, []);

    return (
        <View style={{ width: size, height: size }}>
            <GLView
                style={{ flex: 1, backgroundColor: 'transparent' }}
                onContextCreate={onContextCreate}
            />
        </View>
    );
}
