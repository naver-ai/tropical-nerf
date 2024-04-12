import * as THREE from 'three';
import WebGL from 'three/addons/capabilities/WebGL.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
// import Stats from 'stats.js'


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


var canvases = [$("#teaser0"), $("#teaser1")];  // jQuery

// Scene
const scenes = [new THREE.Scene(), new THREE.Scene()];
const cameras = [
    new THREE.PerspectiveCamera( 65, canvases[0].width() / canvases[0].height(), 0.1, 1000 ), 
    new THREE.PerspectiveCamera( 65, canvases[1].width() / canvases[1].height(), 0.1, 1000 )];

// Calculate a position in Cartesian coordinates from Matplotlib's default spherical coordinates
// Assume a radius (distance from origin) - you may need to adjust this based on your scene's scale
const radius = 10;
const elev = 15; // Matplotlib's default elevation in degrees
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
});

// Renderer
const renderers = [new THREE.WebGLRenderer(), new THREE.WebGLRenderer()];
for ( var i = 0; i < 2; i++ ) {
    renderers[i].setSize( canvases[i].width(), canvases[i].height() );
    // renderer.outputColorSpace = THREE.SRGBColorSpace;
    canvases[i].append( renderers[i].domElement );
};

// Load a GLTF
const loader = new GLTFLoader();
const sceneMeshes = new Array()


function load_glb( loader, path, scene, hflip = false ) {
    loader.load( path, function ( gltf ) {

        // Flip the model across the X-axis
        const scale = 4.3;
        gltf.scene.scale.x = scale * (hflip ? -1 : 1);
        gltf.scene.scale.y = scale;
        gltf.scene.scale.z = scale;

        gltf.scene.traverse(function (child) {
            if (child.isMesh) {
                if (hflip) {
                    child.rotation.y += 1.3;
                } else {
                    child.rotation.y -= 0.2;
                }
                child.material = new THREE.ShaderMaterial({
                    toneMapped: false,
                    side: THREE.DoubleSide,
                    uniforms: {
                        directionVector: { value: new THREE.Vector3(-1, 0, 0).normalize() }
                    },
                    vertexShader: vertex_shader,
                    fragmentShader: fragment_shader
                });
            }
        })
        scene.add(gltf.scene)
        scene.hflip = hflip;
        // console.log(scene)

    }, undefined, function ( error ) {

        console.error( error );

    } );
}


load_glb( loader, './meshes/bunny.glb', scenes[0], true )
load_glb( loader, './meshes/dragon.glb', scenes[1], false )


// Interactive UI
const controls = [
    new OrbitControls(cameras[0], renderers[0].domElement), 
    new OrbitControls(cameras[1], renderers[1].domElement)];
const raycaster = new THREE.Raycaster();

function onMouseMove(event) {
    raycaster.setFromCamera(
        {
            x: (event.clientX / event.clientWidth) * 2 - 1,
            y: -(event.clientY / event.clientHeight) * 2 + 1,
        },
        event.camera
    )
    intersects = raycaster.intersectObjects(sceneMeshes, false)
    if (intersects.length > 0) {
        let n = new THREE.Vector3()
        n.copy(intersects[0].face.normal)
        n.transformDirection(intersects[0].object.matrixWorld)
        arrowHelper.setDirection(n)
        arrowHelper.position.copy(intersects[0].point)
    }
}

for (var i = 0; i < 2; i++) {
    renderers[i].domElement.camera = cameras[i];
    // renderers[i].domElement.addEventListener('mousemove', onMouseMove, false)
};


// Stats
// const stats = new Stats();
// document.body.appendChild(stats.dom);


// Animation
function animate() {
    requestAnimationFrame( animate );
    controls.forEach((control) => { control.update() });

    scenes.forEach((scene) => {
        scene.traverse(function (child) {
            if (child.isMesh) {
                // child.rotation.x += 0.01;
                child.rotation.y += 0.001 * (scene.hflip ? -1 : 1);
            }
        })
    });
    renderers[0].render( scenes[0], cameras[0] );
    renderers[1].render( scenes[1], cameras[1] );
    
    // stats.update();
}


if ( WebGL.isWebGLAvailable() ) {

    // Initiate function or other initializations here
    animate();

} else {

    for ( var i = 0; i < 2; i++ ) {
        const warning = WebGL.getWebGLErrorMessage();
        $( '#teaser' + i ).children().last().remove();
        $( '#teaser' + i ).append( warning );
        $( '#teaser' + i ).css( 'height', '240px')
    }

}