ALTER TABLE coaching_packages ADD CONSTRAINT coaching_packages_id_coach_unique UNIQUE (id,coach_id);
ALTER TABLE client_setup ADD COLUMN package_id uuid;
ALTER TABLE client_setup ADD CONSTRAINT client_setup_package_coach_fk
  FOREIGN KEY (package_id,coach_id) REFERENCES coaching_packages(id,coach_id);
CREATE INDEX client_setup_package ON client_setup(package_id,coach_id) WHERE package_id IS NOT NULL;
