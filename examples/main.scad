// Simple test cube - hot reload test
cube([40, 40, 40]);

// Add a sphere
translate([50, 0, 0])
    sphere(r=20);

// Add a cylinder
translate([0, 50, 0])
    cylinder(h=40, r=18);
