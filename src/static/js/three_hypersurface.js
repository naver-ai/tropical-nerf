import * as THREE from 'three';
import WebGL from 'three/addons/capabilities/WebGL.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';
// import Stats from 'stats.js'
import Delaunator from 'delaunator';


const vertex_shader = `varying vec3 vNormal;

void main() {
    vNormal = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const fragment_shader = `uniform vec3 directionVector;
uniform vec3 color1;
uniform vec3 color2;
varying vec3 vNormal;

// GLSL function to approximate the cm.plasma colormap
vec3 plasmaColormap(float value) {
    // Ensure the value is clamped between 0.0 and 1.0
    value = clamp(value, 0.0, 1.0);

    // Define color stops for the colormap (these are approximations)
    vec3 colorLow = vec3(0.050383, 0.029803, 0.527975); // Purple
    vec3 colorMid = vec3(0.798216, 0.280197, 0.469538); // Pinkish
    vec3 colorHigh = vec3(0.940015, 0.975158, 0.131326); // Yellowish

    // Interpolate between colors based on the input value
    vec3 color;
    if (value < 0.5) {
        // Interpolate between low and mid colors
        color = mix(colorLow, colorMid, value * 2.0); // Scale value to [0,1] for this subrange
    } else {
        // Interpolate between mid and high colors
        color = mix(colorMid, colorHigh, (value - 0.5) * 2.0); // Adjust and scale value for this subrange
    }

    return color;
}

void main() {
    float cosineSimilarity = dot(vNormal, directionVector) * 0.5 + 0.5;
    vec3 color = plasmaColormap(cosineSimilarity); // Interpolate between two colors
    gl_FragColor = vec4(color, 1.0);

    // vec3 color = vNormal * 0.5 + 0.5;
    // gl_FragColor = vec4(color, 1.0);
}`;


function createCustomAxesHelper(axisLength, tubeRadius) {
    const axes = new THREE.Group();

    const materialX = new THREE.MeshBasicMaterial({ color: 0xff0000 });
    const materialY = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
    const materialZ = new THREE.MeshBasicMaterial({ color: 0x0000ff });

    // X Axis - Red
    const geometryX = new THREE.CylinderGeometry(tubeRadius, tubeRadius, axisLength, 8);
    const xAxis = new THREE.Mesh(geometryX, materialX);
    xAxis.rotation.z = -Math.PI / 2;
    xAxis.position.x = axisLength / 2;

    // Y Axis - Green
    const geometryY = new THREE.CylinderGeometry(tubeRadius, tubeRadius, axisLength, 8);
    const yAxis = new THREE.Mesh(geometryY, materialY);
    yAxis.position.y = axisLength / 2;

    // Z Axis - Blue
    const geometryZ = new THREE.CylinderGeometry(tubeRadius, tubeRadius, axisLength, 8);
    const zAxis = new THREE.Mesh(geometryZ, materialZ);
    zAxis.rotation.x = Math.PI / 2;
    zAxis.position.z = axisLength / 2;

    axes.add(xAxis, yAxis, zAxis);

    return axes;
}


function createTextSprite(text, fontSize = 32, fontFace = 'Arial', textColor = 'rgba(0, 0, 0, 1.0)', backgroundColor = 'rgba(255, 255, 255, 0.0)') {
    const scale = window.devicePixelRatio; // Adjust for high-DPI displays
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');

    context.font = `${fontSize}px ${fontFace}`;
    const textWidth = context.measureText(text).width;

    canvas.width = (textWidth + 20) * scale; // Scale canvas size
    canvas.height = (fontSize + 20) * scale;
    context.scale(scale, scale); // Adjust context scale

    context.font = `${fontSize}px ${fontFace}`; // Re-apply font settings on scaled context
    context.fillStyle = backgroundColor;
    context.fillRect(0, 0, canvas.width / scale, canvas.height / scale);

    context.fillStyle = textColor;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(text, canvas.width / (2 * scale), canvas.height / (2 * scale));

    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;

    const material = new THREE.SpriteMaterial({ map: texture });
    const sprite = new THREE.Sprite(material);

    const spriteScale = 1 / scale * 0.005; // Adjust sprite scale to match canvas resolution and desired size
    sprite.scale.set(canvas.width * spriteScale / scale, canvas.height * spriteScale / scale, 1);

    return sprite;
}


function get_cube_wireframe_geometry() {
    // Create an empty geometry for the edges
    var edgesGeometry = new THREE.BufferGeometry();

    // Define vertices for the edges; these points correspond to the 8 corners of the box
    var vertices = new Float32Array([
        -0.5, -0.5,  0.5,  // Vertex 0
         0.5, -0.5,  0.5,  // Vertex 1
         0.5,  0.5,  0.5,  // Vertex 2
        -0.5,  0.5,  0.5,  // Vertex 3
        -0.5, -0.5, -0.5,  // Vertex 4
         0.5, -0.5, -0.5,  // Vertex 5
         0.5,  0.5, -0.5,  // Vertex 6
        -0.5,  0.5, -0.5   // Vertex 7
    ]);

    // Add vertices to the geometry
    edgesGeometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));

    // Define the indices for the lines; this is what creates the rectangular wireframe
    var indices = new Uint16Array([
        0, 1,  1, 2,  2, 3,  3, 0,  // Front face
        4, 5,  5, 6,  6, 7,  7, 4,  // Back face
        0, 4,  1, 5,  2, 6,  3, 7   // Side edges
    ]);

    // Add indices to the geometry
    edgesGeometry.setIndex(new THREE.BufferAttribute(indices, 1));

    // Create a material for the lines
    var edgesMaterial = new THREE.LineBasicMaterial({ color: 0xffffff });

    // Create a LineSegments object with the geometry and material
    var edges = new THREE.LineSegments(edgesGeometry, edgesMaterial);

    return edges
}


function trilinearInterpolation(c000, c001, c010, c011, c100, c101, c110, c111, x, y, z) {
    // Ensure x, y, and z are within the range [0, 1]
    x = Math.max(0, Math.min(1, x));
    y = Math.max(0, Math.min(1, y));
    z = Math.max(0, Math.min(1, z));

    // Interpolate along the x-axis
    const c00 = c000 * (1 - x) + c100 * x;
    const c01 = c001 * (1 - x) + c101 * x;
    const c10 = c010 * (1 - x) + c110 * x;
    const c11 = c011 * (1 - x) + c111 * x;

    // Interpolate along the y-axis
    const c0 = c00 * (1 - y) + c10 * y;
    const c1 = c01 * (1 - y) + c11 * y;

    // Interpolate along the z-axis
    const c = c0 * (1 - z) + c1 * z;

    return c;
}


// Function to create an isosurface for a given c value
function createIsosurface(eps = 0.001, isPlane = true) {
    const geometry = new THREE.BufferGeometry();
    var vertices = [];
    const faces = [];
    
    // Create vertices and faces for the isosurface mesh
    // This is a simplification. In practice, you would solve xyz = c for x and y at various z values
    for (let x = -0.5; x <= 0.5; x += 0.05) {
        for (let y = -0.5; y <= 0.5; y += 0.05) {
            for (let z = -0.5; z <= 0.5; z += 0.05) {
                const offset = isPlane ? 0 : 1;
                const c000 = 0; 
                const c001 = 0.4 + offset;
                const c010 = 0.1 - offset;
                const c011 = 0.5;
                const c100 = -0.5;
                const c101 = -0.1;
                const c110 = -0.4;
                const c111 = 0;
                if (Math.abs(trilinearInterpolation(
                    c000, c001, c010, c011, c100, c101, c110, c111, x + 0.5, y + 0.5, z + 0.5)) <= eps) {
                    vertices.push(new THREE.Vector3(x, y, z));
                }
            }
        }
    }

    // Add vertices to geometry
    // const convexGeometry = new ConvexGeometry(vertices);

    // Perform the Delaunay Triangulation
    const points3D = vertices;
    const points2D = points3D.map(p => [p.x, p.y]); // Projecting onto the X-Y plane

    const delaunay = new Delaunator([].concat(...points2D));

    // Convert points to Three.js vertices
    vertices = new Float32Array(points3D.flatMap(p => [p.x, p.y, p.z]));

    // Use Delaunator's triangles as the faces of the geometry
    const indices = new Uint32Array(delaunay.triangles);

    // Add the vertices and faces to the geometry
    geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
    geometry.setIndex(new THREE.BufferAttribute(indices, 1));

    // Compute normals for the faces
    geometry.computeVertexNormals();

    // Create mesh and add to the scene
    // const material = new THREE.MeshBasicMaterial({ color: 0xff0000, wireframe: true });
    const material = new THREE.ShaderMaterial({
        toneMapped: false,
        side: THREE.DoubleSide,
        uniforms: {
            directionVector: { value: new THREE.Vector3(-1, 0, 0).normalize() }
        },
        vertexShader: vertex_shader,
        fragmentShader: fragment_shader
    });
    const mesh = new THREE.Mesh(geometry, material);
    const wire = new THREE.Mesh(geometry, 
        new THREE.MeshBasicMaterial({ color: 0x000000, wireframe: true }));

    return [mesh, wire];
}


var canvases = [$("#hypersurface"), $("#hyperplane")];  // jQuery

// Scene
const scenes = [new THREE.Scene(), new THREE.Scene()];
const cameras = [
    new THREE.PerspectiveCamera( 45, canvases[0].width() / canvases[0].height(), 0.1, 1000 ),
    new THREE.PerspectiveCamera( 45, canvases[1].width() / canvases[1].height(), 0.1, 1000 )];

// Calculate a position in Cartesian coordinates from Matplotlib's default spherical coordinates
// Assume a radius (distance from origin) - you may need to adjust this based on your scene's scale
const radius = 2.5;
const elev = 15 * 2; // Matplotlib's default elevation in degrees
const azim = 120; // Matplotlib's default azimuth in degrees

// Convert angles from degrees to radians
const elevRadians = THREE.MathUtils.degToRad(elev);
const azimRadians = THREE.MathUtils.degToRad(azim);

// Calculate Cartesian coordinates
const x = radius * Math.cos(elevRadians) * Math.cos(azimRadians);
const y = radius * Math.sin(elevRadians);
const z = radius * Math.cos(elevRadians) * Math.sin(azimRadians);

cameras.forEach((camera) => {
    // Set the camera position
    camera.position.set(x, y, z);

    // Assuming the center of your scene is the origin (0, 0, 0)
    camera.lookAt(0, 0, 0);
});

// console.log(scenes);

scenes.forEach((scene) => {
    // console.log(scene);
    scene.background = new THREE.Color( 0xf0f0f0 );
    // scene.add( new THREE.AmbientLight( 0xcccccc ) );

    // add axes
    const axesHelper = createCustomAxesHelper(1, 0.005);
    axesHelper.position.set(-0.5, -0.5, -0.5)
    scene.add( axesHelper );

    // add a cube
    const line = get_cube_wireframe_geometry()
    line.material.depthTest = false;
    line.material.opacity = 0.7;
    line.material.transparent = true;
    line.material.color = 0x000000;

    scene.add( line );

    // add notations
    for ( var i = 0; i < 8; i++ ) {
        var textSprite = createTextSprite( 'P' + i );
        const offset = 0.04;
        var z = (i & 4) ? 0.5 + offset : -0.5 - offset;
        var y = (i & 2) ? 0.5 + offset : -0.5 - offset;
        var x = (i & 1) ? 0.5 + offset : -0.5 - offset;
        textSprite.position.set(x, y, z); // Position where you want the floating text
        scene.add(textSprite);
    } 
    
    // isosurface
    const results = createIsosurface(0.0001, scene == scenes[1]);
    scene.add(results[0]);  // mesh
    // scene.add(results[1]);  // wire
});

// Renderer
const renderers = [new THREE.WebGLRenderer(), new THREE.WebGLRenderer()];
for ( var i = 0; i < scenes.length; i++ ) {
    renderers[i].setSize( canvases[i].width(), canvases[i].height() );
    // renderer.outputColorSpace = THREE.SRGBColorSpace;
    canvases[i].append( renderers[i].domElement );
};

// Load a GLTF
const sceneMeshes = new Array()

// Interactive UI
const controls = [
    new OrbitControls(cameras[0], renderers[0].domElement), 
    new OrbitControls(cameras[1], renderers[1].domElement)];
const raycaster = new THREE.Raycaster();

// Stats
// const stats = new Stats();
// document.body.appendChild(stats.dom);

// Animation
function animate() {
    requestAnimationFrame( animate );
    controls.forEach((control) => { control.update() });

    scenes.forEach((scene) => {
        scene.rotation.y += 0.001;
    });
    renderers[0].render( scenes[0], cameras[0] );
    renderers[1].render( scenes[1], cameras[1] );
    
    // stats.update();
}

function set_warning( el ) {
    const warning = WebGL.getWebGLErrorMessage();

    el.children().last().remove();
    el.append( warning );
    el.css( 'height', '240px');
}

if ( WebGL.isWebGLAvailable() ) {

    // Initiate function or other initializations here
    animate();

} else {

    set_warning($( '#hypersurface' ));
    set_warning($( '#hyperplane' ));

}