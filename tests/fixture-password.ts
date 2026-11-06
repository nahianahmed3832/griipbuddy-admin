export function fixturePassword() {
  const password = process.env.GRIIPBUDDY_TEST_FIXTURE_PASSWORD;
  if (!password) throw new Error('Set GRIIPBUDDY_TEST_FIXTURE_PASSWORD to the password from the private recovery fixture.');
  return password;
}
