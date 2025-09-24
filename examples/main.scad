// Simple test cube
cube([20, 20, 20]);

// Add a sphere
translate([30, 0, 0])
    sphere(r=10);

// Add a cylinder
translate([0, 30, 0])
    cylinder(h=20, r=8);